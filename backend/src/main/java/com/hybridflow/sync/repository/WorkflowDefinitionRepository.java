package com.hybridflow.sync.repository;

import com.hybridflow.sync.model.ParsedSchedule;
import com.hybridflow.sync.model.ScheduledWorkflowRow;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository @RequiredArgsConstructor
public class WorkflowDefinitionRepository {
    private final JdbcTemplate jdbc;

    public Optional<String> findDefinition(String workflowId) {
        return jdbc.query("SELECT definition::text FROM workflow_definitions WHERE flow_id=?",
                (rs, number) -> rs.getString(1), workflowId).stream().findFirst();
    }

    public Optional<String> findConnection(String workflowId) {
        return jdbc.query("SELECT google_connection_id FROM workflow_definitions WHERE flow_id=?",
                (rs, number) -> rs.getString(1), workflowId).stream().filter(Objects::nonNull).findFirst();
    }

    public void saveDefinition(String workflowId, String definition) {
        saveDefinitionWithSchedule(workflowId, definition, ParsedSchedule.disable(), null);
    }

    public void saveDefinitionWithSchedule(String workflowId, String definition, ParsedSchedule schedule, String connection) {
        jdbc.update("""
                INSERT INTO workflow_definitions(flow_id,definition,schedule_enabled,schedule_type,
                    interval_minutes,daily_time,schedule_timezone,google_connection_id,next_run_at)
                VALUES (?,?::jsonb,?,?,?,?,?,?,?)
                ON CONFLICT(flow_id) DO UPDATE SET
                    definition=EXCLUDED.definition, schedule_enabled=EXCLUDED.schedule_enabled,
                    schedule_type=EXCLUDED.schedule_type, interval_minutes=EXCLUDED.interval_minutes,
                    daily_time=EXCLUDED.daily_time, schedule_timezone=EXCLUDED.schedule_timezone,
                    google_connection_id=COALESCE(EXCLUDED.google_connection_id,workflow_definitions.google_connection_id),
                    next_run_at=CASE
                        WHEN NOT EXCLUDED.schedule_enabled THEN NULL
                        WHEN workflow_definitions.schedule_enabled
                            AND workflow_definitions.schedule_type=EXCLUDED.schedule_type
                            AND (EXCLUDED.schedule_type <> 'interval' OR workflow_definitions.interval_minutes=EXCLUDED.interval_minutes)
                            AND (EXCLUDED.schedule_type <> 'daily' OR (workflow_definitions.daily_time=EXCLUDED.daily_time
                                AND workflow_definitions.schedule_timezone=EXCLUDED.schedule_timezone))
                        THEN workflow_definitions.next_run_at
                        ELSE EXCLUDED.next_run_at END,
                    schedule_revision=workflow_definitions.schedule_revision + CASE
                        WHEN workflow_definitions.definition IS DISTINCT FROM EXCLUDED.definition
                            OR workflow_definitions.schedule_enabled IS DISTINCT FROM EXCLUDED.schedule_enabled
                            OR (EXCLUDED.google_connection_id IS NOT NULL AND workflow_definitions.google_connection_id IS DISTINCT FROM EXCLUDED.google_connection_id)
                        THEN 1 ELSE 0 END,
                    updated_at=CURRENT_TIMESTAMP
                """, workflowId, definition, schedule.isEnabled(), schedule.getScheduleType(), schedule.getIntervalMinutes(),
                schedule.getDailyTime(), schedule.getTimezone(), connection,
                schedule.getNextRunAt() == null ? null : Timestamp.from(schedule.getNextRunAt()));
    }

    public List<ScheduledWorkflowRow> lockDueWorkflows(Instant now) {
        return jdbc.query("""
                SELECT d.* FROM workflow_definitions d
                LEFT JOIN business_modules m ON m.workspace_id=d.workspace_id AND m.id=d.module_id
                WHERE d.schedule_enabled AND d.next_run_at <= ?
                  AND (d.workspace_id IS NULL OR (d.enabled AND (d.module_id IS NULL OR m.enabled)))
                  AND NOT EXISTS (SELECT 1 FROM workflow_jobs j WHERE j.workflow_id=d.flow_id
                      AND (j.state IN ('READY','RETRY','RUNNING') OR (j.revision=d.schedule_revision
                          AND j.state IN ('NEEDS_CONNECTION','NEEDS_BOOTSTRAP','DEAD'))))
                ORDER BY d.next_run_at LIMIT 100 FOR UPDATE OF d SKIP LOCKED
                """, (rs, number) -> ScheduledWorkflowRow.builder().flowId(rs.getString("flow_id"))
                .workspaceId(rs.getObject("workspace_id", UUID.class))
                .moduleId(rs.getObject("module_id", UUID.class))
                .definitionJson(rs.getString("definition")).scheduleType(rs.getString("schedule_type"))
                .intervalMinutes(rs.getInt("interval_minutes")).dailyTime(rs.getString("daily_time"))
                .timezone(rs.getString("schedule_timezone")).revision(rs.getLong("schedule_revision"))
                .nextRunAt(rs.getTimestamp("next_run_at").toInstant()).build(), Timestamp.from(now));
    }

    public void advanceSchedule(String workflowId, Instant next) {
        jdbc.update("UPDATE workflow_definitions SET next_run_at=? WHERE flow_id=?", Timestamp.from(next), workflowId);
    }

    public boolean isCurrent(String workflowId, long revision) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM workflow_definitions WHERE flow_id=? AND schedule_enabled AND schedule_revision=?)",
                Boolean.class, workflowId, revision));
    }

    public void markSuccessful(String workflowId, Instant now) {
        jdbc.update("UPDATE workflow_definitions SET last_run_at=? WHERE flow_id=?", Timestamp.from(now), workflowId);
    }

    public void resumeAfterManualRun(String workflowId) {
        jdbc.update("UPDATE workflow_jobs SET state='CANCELLED',error=NULL,error_code=NULL WHERE workflow_id=? AND state IN ('NEEDS_BOOTSTRAP','DEAD')", workflowId);
    }

    public Map<String, Object> scheduleStatus(String workflowId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT d.schedule_enabled AS enabled,d.next_run_at,d.last_run_at,d.schedule_timezone,
                    j.state,j.error,j.error_code,j.correlation_id,j.attempts FROM workflow_definitions d
                LEFT JOIN LATERAL (SELECT state,error,error_code,correlation_id,attempts FROM workflow_jobs WHERE workflow_id=d.flow_id
                    ORDER BY scheduled_at DESC LIMIT 1) j ON TRUE WHERE d.flow_id=?
                """, workflowId);
        return rows.isEmpty() ? Map.of("enabled", false) : rows.getFirst();
    }
}
