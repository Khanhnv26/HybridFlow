package com.hybridflow.sync.repository;

import com.hybridflow.sync.model.ParsedSchedule;
import com.hybridflow.sync.model.ScheduledWorkflowRow;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class WorkflowDefinitionRepository {
    private final JdbcTemplate jdbc;

    public Optional<String> findDefinition(String workflowId) {
        List<String> definitions = jdbc.query(
                "SELECT definition::text FROM workflow_definitions WHERE flow_id=?",
                (resultSet, rowNumber) -> resultSet.getString(1),
                workflowId
        );
        return definitions.stream().findFirst();
    }

    public void saveDefinition(String workflowId, String definition) {
        saveDefinitionWithSchedule(workflowId, definition, ParsedSchedule.disable(), null);
    }

    public void saveDefinitionWithSchedule(
            String workflowId,
            String definition,
            ParsedSchedule schedule,
            String accessToken
    ) {
        Timestamp nextRun = schedule.getNextRunAt() != null
                ? Timestamp.valueOf(schedule.getNextRunAt())
                : null;

        jdbc.update(
                "INSERT INTO workflow_definitions("
                        + "flow_id, definition, schedule_enabled, schedule_type, "
                        + "interval_minutes, daily_time, access_token, next_run_at"
                        + ") VALUES (?, ?::jsonb, ?, ?, ?, ?, ?, ?) "
                        + "ON CONFLICT(flow_id) DO UPDATE SET "
                        + "definition = EXCLUDED.definition, "
                        + "schedule_enabled = EXCLUDED.schedule_enabled, "
                        + "schedule_type = EXCLUDED.schedule_type, "
                        + "interval_minutes = EXCLUDED.interval_minutes, "
                        + "daily_time = EXCLUDED.daily_time, "
                        + "access_token = COALESCE(EXCLUDED.access_token, workflow_definitions.access_token), "
                        + "next_run_at = EXCLUDED.next_run_at, "
                        + "updated_at = CURRENT_TIMESTAMP",
                workflowId,
                definition,
                schedule.isEnabled(),
                schedule.getScheduleType(),
                schedule.getIntervalMinutes(),
                schedule.getDailyTime(),
                accessToken,
                nextRun
        );
    }

    public List<ScheduledWorkflowRow> findDueWorkflows(LocalDateTime now) {
        return jdbc.query(
                "SELECT flow_id, definition::text, schedule_type, interval_minutes, daily_time, access_token "
                        + "FROM workflow_definitions "
                        + "WHERE schedule_enabled = TRUE "
                        + "AND next_run_at IS NOT NULL "
                        + "AND next_run_at <= ?",
                (resultSet, rowNumber) -> ScheduledWorkflowRow.builder()
                        .flowId(resultSet.getString("flow_id"))
                        .definitionJson(resultSet.getString("definition"))
                        .scheduleType(resultSet.getString("schedule_type"))
                        .intervalMinutes(resultSet.getInt("interval_minutes"))
                        .dailyTime(resultSet.getString("daily_time"))
                        .accessToken(resultSet.getString("access_token"))
                        .build(),
                Timestamp.valueOf(now)
        );
    }

    public void markScheduledRunCompleted(
            String flowId,
            LocalDateTime lastRunAt,
            LocalDateTime nextRunAt
    ) {
        jdbc.update(
                "UPDATE workflow_definitions SET last_run_at = ?, next_run_at = ? WHERE flow_id = ?",
                Timestamp.valueOf(lastRunAt),
                Timestamp.valueOf(nextRunAt),
                flowId
        );
    }
}