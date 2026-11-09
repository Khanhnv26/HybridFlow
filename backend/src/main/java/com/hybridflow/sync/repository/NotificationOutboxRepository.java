package com.hybridflow.sync.repository;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.sync.model.NotificationOutboxItem;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class NotificationOutboxRepository {
    private final JdbcTemplate jdbc;

    private static final RowMapper<NotificationOutboxItem> MAPPER = new RowMapper<>() {
        @Override
        public NotificationOutboxItem mapRow(ResultSet rs, int rowNum) throws SQLException {
            Timestamp avail = rs.getTimestamp("available_at");
            Timestamp lease = rs.getTimestamp("lease_until");
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp sent = rs.getTimestamp("sent_at");
            UUID workspaceId = rs.getObject("workspace_id", UUID.class);
            String connectionId = rs.getString("connection_id");
            return NotificationOutboxItem.builder()
                    .id(rs.getString("id"))
                    .flowId(rs.getString("flow_id"))
                    .executionId(rs.getString("execution_id"))
                    .actionNodeId(rs.getString("action_node_id"))
                    .channel(rs.getString("channel"))
                    .destination(rs.getString("destination"))
                    .sourceType(rs.getString("source_type"))
                    .sourceKey(rs.getString("source_key"))
                    .message(rs.getString("message"))
                    .state(rs.getString("state"))
                    .attempts(rs.getInt("attempts"))
                    .availableAt(avail != null ? avail.toInstant() : null)
                    .leaseUntil(lease != null ? lease.toInstant() : null)
                    .owner(rs.getString("owner"))
                    .lastError(rs.getString("last_error"))
                    .errorCode(rs.getString("error_code"))
                    .correlationId(rs.getString("correlation_id"))
                    .createdAt(created != null ? created.toInstant() : null)
                    .sentAt(sent != null ? sent.toInstant() : null)
                    .workspaceId(workspaceId)
                    .connectionId(connectionId)
                    .build();
        }
    };

    public boolean enqueue(NotificationOutboxItem item) {
        return jdbc.update("""
                INSERT INTO notification_outbox(
                    id, flow_id, execution_id, action_node_id, channel, destination,
                    source_type, source_key, message, state, attempts, available_at, correlation_id,
                    workspace_id, connection_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
                ON CONFLICT (action_node_id, source_type, source_key) DO NOTHING
                """,
                item.getId() != null ? item.getId() : UUID.randomUUID().toString(),
                item.getFlowId(),
                item.getExecutionId(),
                item.getActionNodeId(),
                item.getChannel(),
                item.getDestination(),
                item.getSourceType(),
                item.getSourceKey(),
                item.getMessage(),
                item.getState() == null ? "PENDING" : item.getState(),
                Timestamp.from(item.getAvailableAt() != null ? item.getAvailableAt() : Instant.now()),
                item.getCorrelationId(),
                item.getWorkspaceId(),
                item.getConnectionId()
        ) == 1;
    }

    public boolean exists(String actionNodeId, String sourceType, String sourceKey) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM notification_outbox
                WHERE action_node_id = ? AND source_type = ? AND source_key = ?)
                """, Boolean.class, actionNodeId, sourceType, sourceKey));
    }

    public Optional<NotificationOutboxItem> claim(Instant now, int leaseSeconds, int maxAttempts) {
        String owner = UUID.randomUUID().toString();
        List<NotificationOutboxItem> claimed = jdbc.query("""
                WITH candidate AS (
                    SELECT o.id FROM notification_outbox o
                    WHERE ((o.attempts < ? AND o.state IN ('PENDING', 'FAILED') AND o.available_at <= ?)
                        OR (o.state = 'SENDING' AND o.lease_until <= ?))
                      AND (o.workspace_id IS NULL OR o.connection_id IS NULL OR EXISTS (
                          SELECT 1 FROM workspace_connections wc
                          WHERE wc.id = o.connection_id AND wc.workspace_id = o.workspace_id AND wc.state = 'ACTIVE'
                      ))
                    ORDER BY o.available_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
                )
                UPDATE notification_outbox o
                SET state = 'SENDING', owner = ?, lease_until = ?,
                    attempts = CASE WHEN o.state = 'SENDING' THEN o.attempts ELSE o.attempts + 1 END
                FROM candidate
                WHERE o.id = candidate.id
                RETURNING o.*
                """, MAPPER, maxAttempts, Timestamp.from(now), Timestamp.from(now), owner,
                Timestamp.from(now.plusSeconds(leaseSeconds)));
        return claimed.stream().findFirst();
    }

    public void markSent(String id, String owner, Instant now) {
        jdbc.update("""
                UPDATE notification_outbox
                SET state = 'SENT', sent_at = ?, lease_until = NULL, last_error = NULL, error_code = NULL
                WHERE id = ? AND owner = ? AND state = 'SENDING'
                """, Timestamp.from(now), id, owner);
    }

    public void recordFailure(String id, String owner, ErrorDetails details) {
        jdbc.update("UPDATE notification_outbox SET error_code=?,correlation_id=? WHERE id=? AND owner=? AND state='SENDING'",
                details.getCode().name(), details.getCorrelationId(), id, owner);
    }

    public void markFailed(String id, String owner, String error, Instant nextAvailable, boolean isDead) {
        jdbc.update("""
                UPDATE notification_outbox
                SET state = ?, last_error = ?, available_at = ?, lease_until = NULL
                WHERE id = ? AND owner = ? AND state = 'SENDING'
                """, isDead ? "DEAD" : "FAILED", error, Timestamp.from(nextAvailable), id, owner);
    }

    public void deferRateLimited(String id, String owner, String error, Instant nextAvailable) {
        jdbc.update("""
                UPDATE notification_outbox
                SET state = 'FAILED', attempts = GREATEST(attempts - 1, 0),
                    last_error = ?, available_at = ?, lease_until = NULL
                WHERE id = ? AND owner = ? AND state = 'SENDING'
                """, error, Timestamp.from(nextAvailable), id, owner);
    }

    public void deferConnection(String connectionId, Instant nextAvailable) {
        if (connectionId == null || connectionId.isBlank()) return;
        jdbc.update("""
                UPDATE notification_outbox
                SET available_at = GREATEST(available_at, ?)
                WHERE connection_id = ? AND state IN ('PENDING', 'FAILED')
                """, Timestamp.from(nextAvailable), connectionId);
    }

    public List<NotificationOutboxItem> findByFlowId(String flowId, String executionId, int limit) {
        return findByFlowId(flowId, executionId, limit, 0);
    }

    public List<NotificationOutboxItem> findByFlowId(String flowId, String executionId, int limit, int offset) {
        if (executionId != null && !executionId.isBlank()) {
            return jdbc.query("""
                    SELECT * FROM notification_outbox WHERE flow_id = ? AND execution_id = ?
                    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
                    """, MAPPER, flowId, executionId, limit, offset);
        }
        return jdbc.query("""
                SELECT * FROM notification_outbox
                WHERE flow_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ? OFFSET ?
                """, MAPPER, flowId, limit, offset);
    }

    public boolean retry(String id, Instant now) {
        return jdbc.update("""
                UPDATE notification_outbox
                SET state = 'PENDING', attempts = 0, available_at = ?, lease_until = NULL, last_error = NULL, error_code = NULL
                WHERE id = ? AND state IN ('FAILED', 'DEAD')
                """, Timestamp.from(now), id) == 1;
    }
}
