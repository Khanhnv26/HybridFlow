package com.hybridflow.workspace.repository;

import com.hybridflow.workspace.dto.response.MemberResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class MembershipRepository {
    private final JdbcTemplate jdbc;

    public void insert(UUID workspaceId, UUID userId, WorkspaceRole role) {
        jdbc.update("INSERT INTO workspace_members(workspace_id, user_id, role) VALUES (?, ?, ?)",
                workspaceId, userId, role.name());
    }

    public void insertIfAbsent(UUID workspaceId, UUID userId, WorkspaceRole role) {
        jdbc.update("""
                INSERT INTO workspace_members(workspace_id, user_id, role) VALUES (?, ?, ?)
                ON CONFLICT(workspace_id, user_id) DO NOTHING
                """, workspaceId, userId, role.name());
    }

    public Optional<WorkspaceRole> findRole(UUID workspaceId, UUID userId) {
        return jdbc.query("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
                (rs, row) -> WorkspaceRole.valueOf(rs.getString("role")), workspaceId, userId)
                .stream().findFirst();
    }

    public Optional<WorkspaceRole> findRoleForUpdate(UUID workspaceId, UUID userId) {
        return jdbc.query("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? FOR UPDATE",
                (rs, row) -> WorkspaceRole.valueOf(rs.getString("role")), workspaceId, userId)
                .stream().findFirst();
    }

    public List<MemberResponse> findMembers(UUID workspaceId) {
        return jdbc.query("""
                SELECT m.workspace_id, m.user_id, u.email, u.display_name, m.role, m.joined_at
                FROM workspace_members m
                JOIN app_users u ON u.id = m.user_id
                WHERE m.workspace_id = ?
                ORDER BY m.joined_at, m.user_id
                """, (rs, row) -> {
            Timestamp timestamp = rs.getTimestamp("joined_at");
            return new MemberResponse(
                    rs.getObject("workspace_id", UUID.class),
                    rs.getObject("user_id", UUID.class),
                    rs.getString("email"),
                    rs.getString("display_name"),
                    WorkspaceRole.valueOf(rs.getString("role")),
                    timestamp != null ? timestamp.toInstant() : null
            );
        }, workspaceId);
    }

    public int updateRole(UUID workspaceId, UUID userId, WorkspaceRole role) {
        return jdbc.update("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?",
                role.name(), workspaceId, userId);
    }

    public int delete(UUID workspaceId, UUID userId) {
        return jdbc.update("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
                workspaceId, userId);
    }
}
