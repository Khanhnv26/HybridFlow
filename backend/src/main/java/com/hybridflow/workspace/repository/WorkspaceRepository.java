package com.hybridflow.workspace.repository;

import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class WorkspaceRepository {
    private final JdbcTemplate jdbc;

    public void insert(UUID id, String name) {
        jdbc.update("INSERT INTO workspaces(id, name) VALUES (?, ?)", id, name);
    }

    public List<WorkspaceResponse> findForUser(UUID userId) {
        return jdbc.query("""
                SELECT w.id, w.name, m.role FROM workspaces w
                JOIN workspace_members m ON m.workspace_id = w.id
                WHERE m.user_id = ? ORDER BY w.created_at, w.id
                """, (rs, row) -> new WorkspaceResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        WorkspaceRole.valueOf(rs.getString("role"))), userId);
    }
}
