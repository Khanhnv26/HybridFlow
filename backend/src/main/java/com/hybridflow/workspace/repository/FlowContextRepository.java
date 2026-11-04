package com.hybridflow.workspace.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class FlowContextRepository {
    private final JdbcTemplate jdbc;

    public void ensure(UUID workspaceId, String workflowId, String configFingerprint, String contextId) {
        jdbc.update("""
                INSERT INTO flow_contexts(flow_id, workspace_id, workflow_id, config_fingerprint)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(flow_id) DO NOTHING
                """, contextId, workspaceId, workflowId, configFingerprint);
    }

    public Optional<String> findWorkflowId(String contextId) {
        return jdbc.query("SELECT workflow_id FROM flow_contexts WHERE flow_id = ?",
                (rs, row) -> rs.getString("workflow_id"), contextId).stream().findFirst();
    }

    public Optional<UUID> findWorkspaceId(String contextId) {
        return jdbc.query("SELECT workspace_id FROM flow_contexts WHERE flow_id = ?",
                (rs, row) -> rs.getObject("workspace_id", UUID.class), contextId).stream().findFirst();
    }
}
