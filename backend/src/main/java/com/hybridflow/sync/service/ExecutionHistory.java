package com.hybridflow.sync.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class ExecutionHistory {
    private final JdbcTemplate jdbc;
    private final SyncStore store;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String start(String flow) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO sync_executions(id,flow_id,status) VALUES (?,?,'RUNNING')", id, flow);
        return id;
    }
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finish(String id, String status, Object result, String error) {
        jdbc.update("UPDATE sync_executions SET status=?,result=?::jsonb,error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",
                status, result == null ? null : store.encode(result), error, id);
    }
    public List<Map<String, Object>> list(String flow) {
        return jdbc.queryForList("SELECT id,status,result::text AS result,error,started_at,finished_at FROM sync_executions WHERE flow_id=? ORDER BY started_at DESC LIMIT 50", flow);
    }
}
