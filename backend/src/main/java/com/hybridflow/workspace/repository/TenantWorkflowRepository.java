package com.hybridflow.workspace.repository;

import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.workspace.dto.request.ConnectionBindingItem;
import com.hybridflow.workspace.dto.response.WorkflowPermissionResponse;
import com.hybridflow.workspace.model.TenantWorkflowRow;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class TenantWorkflowRepository {
    private final JdbcTemplate jdbc;

    public boolean exists(UUID workspaceId, String workflowId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM workflow_definitions
                WHERE workspace_id=? AND flow_id=?)
                """, Boolean.class, workspaceId, workflowId));
    }

    public boolean granted(UUID workspaceId, String workflowId, UUID userId, String action) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM workflow_permissions
                WHERE workspace_id=? AND workflow_id=? AND user_id=?
                AND (?='READ' OR (?='EDIT' AND can_edit) OR (?='RUN' AND can_run)))
                """, Boolean.class, workspaceId, workflowId, userId, action, action, action));
    }

    public boolean runnable(UUID workspaceId, String workflowId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM workflow_definitions d
                LEFT JOIN business_modules m ON m.workspace_id=d.workspace_id AND m.id=d.module_id
                WHERE d.workspace_id=? AND d.flow_id=? AND d.enabled AND (d.module_id IS NULL OR m.enabled))
                """, Boolean.class, workspaceId, workflowId));
    }

    public boolean contextBelongs(UUID workspaceId, String workflowId, String contextId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM flow_contexts
                WHERE workspace_id=? AND workflow_id=? AND flow_id=?)
                """, Boolean.class, workspaceId, workflowId, contextId));
    }

    public List<String> findContextIds(UUID workspaceId, String workflowId) {
        return jdbc.queryForList("SELECT flow_id FROM flow_contexts WHERE workspace_id=? AND workflow_id=? ORDER BY created_at DESC,flow_id",
                String.class, workspaceId, workflowId);
    }

    public Map<String, Object> scheduleStatus(UUID workspaceId, String workflowId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT d.schedule_enabled AS enabled,d.next_run_at,d.last_run_at,d.schedule_timezone,
                    j.state,j.error,j.error_code,j.correlation_id,j.attempts
                FROM workflow_definitions d
                LEFT JOIN LATERAL (SELECT state,error,error_code,correlation_id,attempts FROM workflow_jobs
                    WHERE workflow_id=d.flow_id AND workspace_id=d.workspace_id
                    ORDER BY scheduled_at DESC LIMIT 1) j ON TRUE
                WHERE d.workspace_id=? AND d.flow_id=?
                """, workspaceId, workflowId);
        return rows.isEmpty() ? Map.of("enabled", false) : rows.getFirst();
    }

    public void insertWorkflow(UUID workspaceId, UUID moduleId, String workflowId, String name, String definitionJson) {
        jdbc.update("""
                INSERT INTO workflow_definitions(workspace_id, module_id, flow_id, name, definition, enabled, definition_version)
                VALUES (?, ?, ?, ?, ?::jsonb, false, 1)
                """, workspaceId, moduleId, workflowId, name, definitionJson);
    }

    public Optional<TenantWorkflowRow> findWorkflow(UUID workspaceId, String workflowId) {
        return jdbc.query("""
                SELECT flow_id, workspace_id, module_id, name, enabled, definition_version, definition::text AS definition_text,
                       next_run_at, schedule_type, interval_minutes, daily_time, schedule_timezone AS timezone, schedule_revision, updated_at
                FROM workflow_definitions
                WHERE workspace_id=? AND flow_id=?
                """, (rs, row) -> {
            Timestamp nextRun = rs.getTimestamp("next_run_at");
            Timestamp updated = rs.getTimestamp("updated_at");
            return TenantWorkflowRow.builder()
                    .flowId(rs.getString("flow_id"))
                    .workspaceId(rs.getObject("workspace_id", UUID.class))
                    .moduleId(rs.getObject("module_id", UUID.class))
                    .name(rs.getString("name"))
                    .enabled(rs.getBoolean("enabled"))
                    .definitionVersion(rs.getLong("definition_version"))
                    .definitionJson(rs.getString("definition_text"))
                    .nextRunAt(nextRun != null ? nextRun.toInstant() : null)
                    .scheduleType(rs.getString("schedule_type"))
                    .intervalMinutes(rs.getInt("interval_minutes"))
                    .dailyTime(rs.getString("daily_time"))
                    .timezone(rs.getString("timezone"))
                    .scheduleRevision(rs.getLong("schedule_revision"))
                    .updatedAt(updated != null ? updated.toInstant() : null)
                    .build();
        }, workspaceId, workflowId).stream().findFirst();
    }

    public List<TenantWorkflowRow> listWorkflows(UUID workspaceId) {
        return jdbc.query("""
                SELECT flow_id, workspace_id, module_id, name, enabled, definition_version, definition::text AS definition_text,
                       next_run_at, schedule_type, interval_minutes, daily_time, schedule_timezone AS timezone, schedule_revision, updated_at
                FROM workflow_definitions
                WHERE workspace_id=?
                ORDER BY updated_at, flow_id
                """, (rs, row) -> {
            Timestamp nextRun = rs.getTimestamp("next_run_at");
            Timestamp updated = rs.getTimestamp("updated_at");
            return TenantWorkflowRow.builder()
                    .flowId(rs.getString("flow_id"))
                    .workspaceId(rs.getObject("workspace_id", UUID.class))
                    .moduleId(rs.getObject("module_id", UUID.class))
                    .name(rs.getString("name"))
                    .enabled(rs.getBoolean("enabled"))
                    .definitionVersion(rs.getLong("definition_version"))
                    .definitionJson(rs.getString("definition_text"))
                    .nextRunAt(nextRun != null ? nextRun.toInstant() : null)
                    .scheduleType(rs.getString("schedule_type"))
                    .intervalMinutes(rs.getInt("interval_minutes"))
                    .dailyTime(rs.getString("daily_time"))
                    .timezone(rs.getString("timezone"))
                    .scheduleRevision(rs.getLong("schedule_revision"))
                    .updatedAt(updated != null ? updated.toInstant() : null)
                    .build();
        }, workspaceId);
    }

    public int updateWorkflow(UUID workspaceId, String workflowId, long expectedVersion, String definitionJson,
                              String name, UUID moduleId, Boolean enabled, String scheduleType, int intervalMinutes,
                              String dailyTime, Instant nextRunAt, String timezone, long scheduleRevision) {
        return jdbc.update("""
                UPDATE workflow_definitions
                SET definition=?::jsonb, definition_version=definition_version+1, updated_at=now(),
                    name=COALESCE(?, name), module_id=COALESCE(?, module_id), enabled=COALESCE(?, enabled),
                    schedule_type=?, interval_minutes=?, daily_time=?, next_run_at=?, schedule_timezone=?, schedule_revision=?
                WHERE workspace_id=? AND flow_id=? AND definition_version=?
                """, definitionJson, name, moduleId, enabled, scheduleType, intervalMinutes, dailyTime,
                nextRunAt != null ? Timestamp.from(nextRunAt) : null, timezone, scheduleRevision,
                workspaceId, workflowId, expectedVersion);
    }

    public void replaceBindings(UUID workspaceId, String workflowId, List<ConnectionBindingItem> bindings) {
        jdbc.update("DELETE FROM workflow_connection_bindings WHERE workspace_id=? AND workflow_id=?",
                workspaceId, workflowId);
        if (bindings != null) {
            for (ConnectionBindingItem binding : bindings) {
                jdbc.update("""
                        INSERT INTO workflow_connection_bindings(workspace_id, workflow_id, node_id, connection_id)
                        VALUES (?, ?, ?, ?)
                        """, workspaceId, workflowId, binding.getNodeId(), binding.getConnectionId());
            }
        }
    }

    public List<ConnectionBindingItem> findBindings(UUID workspaceId, String workflowId) {
        return jdbc.query("""
                SELECT node_id, connection_id FROM workflow_connection_bindings
                WHERE workspace_id=? AND workflow_id=?
                """, (rs, row) -> new ConnectionBindingItem(
                rs.getString("node_id"), rs.getString("connection_id")), workspaceId, workflowId);
    }

    public void upsertPermission(UUID workspaceId, String workflowId, UUID userId, boolean canEdit, boolean canRun) {
        jdbc.update("""
                INSERT INTO workflow_permissions(workspace_id, workflow_id, user_id, can_edit, can_run)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(workspace_id, workflow_id, user_id)
                DO UPDATE SET can_edit=EXCLUDED.can_edit, can_run=EXCLUDED.can_run
                """, workspaceId, workflowId, userId, canEdit, canRun);
    }

    public List<WorkflowPermissionResponse> findPermissions(UUID workspaceId, String workflowId) {
        return jdbc.query("""
                SELECT workspace_id, workflow_id, user_id, can_edit, can_run
                FROM workflow_permissions
                WHERE workspace_id=? AND workflow_id=?
                """, (rs, row) -> new WorkflowPermissionResponse(
                rs.getObject("workspace_id", UUID.class),
                rs.getString("workflow_id"),
                rs.getObject("user_id", UUID.class),
                rs.getBoolean("can_edit"),
                rs.getBoolean("can_run")), workspaceId, workflowId);
    }

    public List<NotificationOutboxItem> findNotifications(UUID workspaceId, String workflowId, String contextId,
                                                          String executionId, int limit, int offset) {
        return jdbc.query("""
                SELECT n.id, n.flow_id, n.execution_id, n.action_node_id, n.channel, n.destination,
                       n.source_type, n.source_key, n.message, n.state, n.attempts, n.available_at,
                       n.lease_until, n.owner, n.last_error, n.error_code, n.correlation_id,
                       n.created_at, n.sent_at, n.workspace_id, n.connection_id
                FROM notification_outbox n
                JOIN flow_contexts c ON c.flow_id=n.flow_id AND c.workspace_id=n.workspace_id
                WHERE c.workspace_id=? AND c.workflow_id=? AND c.flow_id=? AND n.execution_id=?
                ORDER BY n.created_at DESC LIMIT ? OFFSET ?
                """, (rs, row) -> {
            Timestamp avail = rs.getTimestamp("available_at");
            Timestamp lease = rs.getTimestamp("lease_until");
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp sent = rs.getTimestamp("sent_at");
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
                    .workspaceId(rs.getObject("workspace_id", UUID.class))
                    .connectionId(rs.getString("connection_id"))
                    .build();
        }, workspaceId, workflowId, contextId, executionId, limit, offset);
    }

    public int retryNotification(UUID workspaceId, String workflowId, String notificationId) {
        return jdbc.update("""
                UPDATE notification_outbox n
                SET state='PENDING', attempts=0, available_at=now(), lease_until=NULL,
                    last_error=NULL, error_code=NULL
                FROM flow_contexts c
                WHERE n.id=? AND n.flow_id=c.flow_id AND n.workspace_id=c.workspace_id
                  AND c.workspace_id=? AND c.workflow_id=?
                  AND n.state IN ('FAILED','DEAD')
                """, notificationId, workspaceId, workflowId);
    }

    public boolean isNotificationInScope(UUID workspaceId, String workflowId, String notificationId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(
                    SELECT 1 FROM notification_outbox n
                    JOIN flow_contexts c ON c.flow_id=n.flow_id AND c.workspace_id=n.workspace_id
                    WHERE n.id=? AND c.workspace_id=? AND c.workflow_id=?
                )
                """, Boolean.class, notificationId, workspaceId, workflowId));
    }

    public List<SyncConflict> findConflicts(UUID workspaceId, String workflowId, String contextId) {
        return jdbc.query("""
                SELECT s.id, s.flow_id, s.spreadsheet_id, s.sheet_name, s.id_column, s.endpoints_json,
                       s.candidates_json, s.observations_json, s.record_id, s.column_name, s.base_value,
                       s.value_a, s.value_b, s.resolved_value, s.status, s.created_at, s.resolved_at
                FROM sync_conflicts s
                JOIN flow_contexts c ON c.flow_id=s.flow_id
                WHERE c.workspace_id=? AND c.workflow_id=? AND c.flow_id=? AND s.status='OPEN'
                ORDER BY s.created_at DESC
                """, (rs, row) -> {
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp resolved = rs.getTimestamp("resolved_at");
            return SyncConflict.builder()
                    .id(rs.getLong("id"))
                    .flowId(rs.getString("flow_id"))
                    .spreadsheetId(rs.getString("spreadsheet_id"))
                    .sheetName(rs.getString("sheet_name"))
                    .idColumn(rs.getString("id_column"))
                    .endpointsJson(rs.getString("endpoints_json"))
                    .candidatesJson(rs.getString("candidates_json"))
                    .observationsJson(rs.getString("observations_json"))
                    .recordId(rs.getString("record_id"))
                    .columnName(rs.getString("column_name"))
                    .baseValue(rs.getString("base_value"))
                    .valueA(rs.getString("value_a"))
                    .valueB(rs.getString("value_b"))
                    .resolvedValue(rs.getString("resolved_value"))
                    .status(rs.getString("status"))
                    .createdAt(created != null ? created.toLocalDateTime() : null)
                    .resolvedAt(resolved != null ? resolved.toLocalDateTime() : null)
                    .build();
        }, workspaceId, workflowId, contextId);
    }

    public Optional<SyncConflict> findConflict(UUID workspaceId, String workflowId, String contextId, Long conflictId) {
        List<SyncConflict> list = jdbc.query("""
                SELECT s.id, s.flow_id, s.spreadsheet_id, s.sheet_name, s.id_column, s.endpoints_json,
                       s.candidates_json, s.observations_json, s.record_id, s.column_name, s.base_value,
                       s.value_a, s.value_b, s.resolved_value, s.status, s.created_at, s.resolved_at
                FROM sync_conflicts s
                JOIN flow_contexts c ON c.flow_id=s.flow_id
                WHERE c.workspace_id=? AND c.workflow_id=? AND c.flow_id=? AND s.id=?
                """, (rs, row) -> {
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp resolved = rs.getTimestamp("resolved_at");
            return SyncConflict.builder()
                    .id(rs.getLong("id"))
                    .flowId(rs.getString("flow_id"))
                    .spreadsheetId(rs.getString("spreadsheet_id"))
                    .sheetName(rs.getString("sheet_name"))
                    .idColumn(rs.getString("id_column"))
                    .endpointsJson(rs.getString("endpoints_json"))
                    .candidatesJson(rs.getString("candidates_json"))
                    .observationsJson(rs.getString("observations_json"))
                    .recordId(rs.getString("record_id"))
                    .columnName(rs.getString("column_name"))
                    .baseValue(rs.getString("base_value"))
                    .valueA(rs.getString("value_a"))
                    .valueB(rs.getString("value_b"))
                    .resolvedValue(rs.getString("resolved_value"))
                    .status(rs.getString("status"))
                    .createdAt(created != null ? created.toLocalDateTime() : null)
                    .resolvedAt(resolved != null ? resolved.toLocalDateTime() : null)
                    .build();
        }, workspaceId, workflowId, contextId, conflictId);
        return list.stream().findFirst();
    }

    public List<Map<String, Object>> findExecutions(UUID workspaceId, String workflowId, int limit, int offset) {
        return jdbc.queryForList("""
                SELECT e.id, e.flow_id, e.status, e.result::text AS result, e.error, e.error_code,
                       e.correlation_id, e.started_at, e.finished_at, e.progress::text AS progress
                FROM sync_executions e
                JOIN flow_contexts c ON c.flow_id=e.flow_id
                WHERE c.workspace_id=? AND c.workflow_id=?
                ORDER BY e.started_at DESC, e.id DESC LIMIT ? OFFSET ?
                """, workspaceId, workflowId, limit, offset);
    }

    public void clearExecutions(UUID workspaceId, String workflowId) {
        jdbc.update("""
                DELETE FROM sync_executions e
                USING flow_contexts c
                WHERE e.flow_id = c.flow_id
                  AND c.workspace_id = ? AND c.workflow_id = ?
                  AND e.status != 'RUNNING'
                """, workspaceId, workflowId);
    }
}
