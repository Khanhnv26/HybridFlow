package com.hybridflow.workspace.repository;

import com.hybridflow.workspace.dto.request.SaveModuleRequest;
import com.hybridflow.workspace.dto.response.ModuleResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class ModuleRepository {
    private final JdbcTemplate jdbc;

    public void insert(UUID id, UUID workspaceId, String name, String description, boolean enabled) {
        jdbc.update("""
                INSERT INTO business_modules(id, workspace_id, name, description, enabled)
                VALUES (?, ?, ?, ?, ?)
                """, id, workspaceId, name, description, enabled);
    }

    public int update(UUID workspaceId, UUID moduleId, SaveModuleRequest request) {
        return jdbc.update("""
                UPDATE business_modules SET name = ?, description = ?, enabled = ?
                WHERE workspace_id = ? AND id = ?
                """, request.getName().trim(), request.getDescription(), request.isEnabled(), workspaceId, moduleId);
    }

    public Optional<ModuleResponse> find(UUID workspaceId, UUID moduleId) {
        return jdbc.query("""
                SELECT id, workspace_id, name, description, enabled, created_at
                FROM business_modules
                WHERE workspace_id = ? AND id = ?
                """, (rs, row) -> {
            Timestamp timestamp = rs.getTimestamp("created_at");
            return new ModuleResponse(
                    rs.getObject("id", UUID.class),
                    rs.getObject("workspace_id", UUID.class),
                    rs.getString("name"),
                    rs.getString("description"),
                    rs.getBoolean("enabled"),
                    timestamp != null ? timestamp.toInstant() : null
            );
        }, workspaceId, moduleId).stream().findFirst();
    }

    public List<ModuleResponse> list(UUID workspaceId) {
        return jdbc.query("""
                SELECT id, workspace_id, name, description, enabled, created_at
                FROM business_modules
                WHERE workspace_id = ?
                ORDER BY created_at, id
                """, (rs, row) -> {
            Timestamp timestamp = rs.getTimestamp("created_at");
            return new ModuleResponse(
                    rs.getObject("id", UUID.class),
                    rs.getObject("workspace_id", UUID.class),
                    rs.getString("name"),
                    rs.getString("description"),
                    rs.getBoolean("enabled"),
                    timestamp != null ? timestamp.toInstant() : null
            );
        }, workspaceId);
    }
}
