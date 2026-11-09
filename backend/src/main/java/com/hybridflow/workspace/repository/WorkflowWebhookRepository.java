package com.hybridflow.workspace.repository;

import com.hybridflow.workspace.model.WorkflowWebhookRow;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class WorkflowWebhookRepository {
    private final JdbcTemplate jdbc;

    public Optional<WorkflowWebhookRow> findByWorkflow(UUID workspaceId, String workflowId) {
        return jdbc.query("""
                SELECT workspace_id, workflow_id, webhook_token, enabled,
                       last_payload::text AS last_payload_text, last_received_at, created_at
                FROM workflow_webhooks
                WHERE workspace_id = ? AND workflow_id = ?
                """, this::mapRow, workspaceId, workflowId).stream().findFirst();
    }

    public Optional<WorkflowWebhookRow> findByToken(String webhookToken) {
        return jdbc.query("""
                SELECT workspace_id, workflow_id, webhook_token, enabled,
                       last_payload::text AS last_payload_text, last_received_at, created_at
                FROM workflow_webhooks
                WHERE webhook_token = ?
                """, this::mapRow, webhookToken).stream().findFirst();
    }

    public void upsertToken(UUID workspaceId, String workflowId, String webhookToken, boolean enabled) {
        jdbc.update("""
                INSERT INTO workflow_webhooks(workspace_id, workflow_id, webhook_token, enabled)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (workspace_id, workflow_id)
                DO UPDATE SET webhook_token = EXCLUDED.webhook_token, enabled = EXCLUDED.enabled
                """, workspaceId, workflowId, webhookToken, enabled);
    }

    public void updateEnabled(UUID workspaceId, String workflowId, boolean enabled) {
        jdbc.update("""
                UPDATE workflow_webhooks
                SET enabled = ?
                WHERE workspace_id = ? AND workflow_id = ?
                """, enabled, workspaceId, workflowId);
    }

    public void recordPayload(UUID workspaceId, String workflowId, String payloadJson, Instant receivedAt) {
        jdbc.update("""
                UPDATE workflow_webhooks
                SET last_payload = ?::jsonb, last_received_at = ?
                WHERE workspace_id = ? AND workflow_id = ?
                """, payloadJson, Timestamp.from(receivedAt), workspaceId, workflowId);
    }

    private WorkflowWebhookRow mapRow(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        Timestamp lastRec = rs.getTimestamp("last_received_at");
        Timestamp created = rs.getTimestamp("created_at");
        return WorkflowWebhookRow.builder()
                .workspaceId(rs.getObject("workspace_id", UUID.class))
                .workflowId(rs.getString("workflow_id"))
                .webhookToken(rs.getString("webhook_token"))
                .enabled(rs.getBoolean("enabled"))
                .lastPayloadJson(rs.getString("last_payload_text"))
                .lastReceivedAt(lastRec != null ? lastRec.toInstant() : null)
                .createdAt(created != null ? created.toInstant() : null)
                .build();
    }
}
