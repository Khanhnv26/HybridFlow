package com.hybridflow.sync.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

@Repository
@RequiredArgsConstructor
public class ExecutionHistoryRepository {
    private final JdbcTemplate jdbc;

    public void start(String executionId, String flowId) {
        jdbc.update("INSERT INTO sync_executions(id,flow_id,status) VALUES (?,?,'RUNNING')", executionId, flowId);
    }

    public void finish(String executionId, String status, String resultJson, String error) {
        jdbc.update("UPDATE sync_executions SET status=?,result=?::jsonb,error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",
                status, resultJson, error, executionId);
    }

    public List<Map<String, Object>> findByFlowId(String flowId) {
        return jdbc.queryForList("SELECT id,status,result::text AS result,error,started_at,finished_at,progress::text AS progress "
                + "FROM sync_executions WHERE flow_id=? ORDER BY started_at DESC LIMIT 50", flowId);
    }

    public void appendProgress(String executionId, String event) {
        jdbc.update("UPDATE sync_executions SET progress=progress || jsonb_build_array(?::jsonb) WHERE id=? AND status='RUNNING'", event, executionId);
    }
}
