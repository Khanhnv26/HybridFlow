package com.hybridflow.workspace.repository;

import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class WorkspaceConnectionRepository {
    private final JdbcTemplate jdbc;

    public void insertCatalog(String id, UUID workspaceId, String provider, String name, String state) {
        jdbc.update("""
                INSERT INTO workspace_connections(id, workspace_id, provider, name, state)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (workspace_id, id) DO UPDATE
                SET name = EXCLUDED.name, state = EXCLUDED.state
                """, id, workspaceId, provider, name, state);
    }

    public void insertTelegram(String id, String encryptedBotToken, String botUsername) {
        jdbc.update("""
                INSERT INTO telegram_connections(id, encrypted_bot_token, bot_username)
                VALUES (?, ?, ?)
                ON CONFLICT (id) DO UPDATE
                SET encrypted_bot_token = EXCLUDED.encrypted_bot_token, bot_username = EXCLUDED.bot_username
                """, id, encryptedBotToken, botUsername);
    }

    public Optional<String> findEncryptedTelegramToken(UUID workspaceId, String connectionId) {
        return jdbc.query("""
                SELECT t.encrypted_bot_token FROM telegram_connections t
                JOIN workspace_connections c ON c.id = t.id
                WHERE c.workspace_id = ? AND c.id = ? AND c.state = 'ACTIVE'
                """, (rs, row) -> rs.getString("encrypted_bot_token"), workspaceId, connectionId).stream().findFirst();
    }

    public Optional<String> findGoogleConnectionId(UUID workspaceId, String connectionId) {
        return jdbc.query("""
                SELECT g.id FROM google_connections g
                JOIN workspace_connections c ON c.id = g.id
                WHERE c.workspace_id = ? AND c.id = ? AND c.state = 'ACTIVE'
                """, (rs, row) -> rs.getString("id"), workspaceId, connectionId).stream().findFirst();
    }

    public Optional<String> findState(UUID workspaceId, String connectionId) {
        return jdbc.query("SELECT state FROM workspace_connections WHERE workspace_id = ? AND id = ?",
                (rs, row) -> rs.getString("state"), workspaceId, connectionId).stream().findFirst();
    }

    public List<WorkspaceConnectionResponse> listConnections(UUID workspaceId) {
        return jdbc.query("""
                SELECT c.id, c.name, c.provider, c.state,
                       COUNT(DISTINCT b.workflow_id)::int AS usage_count
                FROM workspace_connections c
                LEFT JOIN workflow_connection_bindings b ON b.workspace_id = c.workspace_id AND b.connection_id = c.id
                WHERE c.workspace_id = ?
                GROUP BY c.id, c.name, c.provider, c.state
                ORDER BY c.name, c.id
                """, (rs, row) -> new WorkspaceConnectionResponse(
                rs.getString("id"),
                rs.getString("name"),
                rs.getString("provider"),
                rs.getString("state"),
                rs.getInt("usage_count")), workspaceId);
    }

    public boolean hasBinding(UUID workspaceId, String connectionId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM workflow_connection_bindings WHERE workspace_id = ? AND connection_id = ?)
                """, Boolean.class, workspaceId, connectionId));
    }

    public void grantEditorRole(UUID workspaceId, String connectionId) {
        jdbc.update("""
                INSERT INTO connection_role_grants(workspace_id, connection_id, role)
                VALUES (?, ?, 'EDITOR')
                ON CONFLICT DO NOTHING
                """, workspaceId, connectionId);
    }

    public boolean hasEditorGrant(UUID workspaceId, String connectionId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM connection_role_grants WHERE workspace_id = ? AND connection_id = ? AND role = 'EDITOR')
                """, Boolean.class, workspaceId, connectionId));
    }

    public int revoke(UUID workspaceId, String connectionId) {
        return jdbc.update("UPDATE workspace_connections SET state = 'REVOKED' WHERE workspace_id = ? AND id = ?",
                workspaceId, connectionId);
    }

    public int delete(UUID workspaceId, String connectionId) {
        jdbc.update("DELETE FROM telegram_connections WHERE id = ?", connectionId);
        return jdbc.update("DELETE FROM workspace_connections WHERE workspace_id = ? AND id = ?",
                workspaceId, connectionId);
    }
}
