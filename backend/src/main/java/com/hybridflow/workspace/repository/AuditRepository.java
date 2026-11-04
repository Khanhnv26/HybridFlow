package com.hybridflow.workspace.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class AuditRepository {
    private final JdbcTemplate jdbc;

    public void insert(UUID id, UUID workspaceId, UUID actorUserId, String action, String resourceId, String correlationId) {
        jdbc.update("""
                INSERT INTO workspace_audit(id, workspace_id, actor_user_id, action, resource_id, correlation_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, workspaceId, actorUserId, action, resourceId, correlationId);
    }
}
