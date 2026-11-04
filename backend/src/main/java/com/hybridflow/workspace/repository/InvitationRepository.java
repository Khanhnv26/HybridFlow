package com.hybridflow.workspace.repository;

import com.hybridflow.workspace.model.InvitationRow;
import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class InvitationRepository {
    private final JdbcTemplate jdbc;

    public void insert(UUID id, UUID workspaceId, String email, WorkspaceRole role,
                       String tokenHash, Instant expiresAt, UUID createdBy) {
        jdbc.update("""
                INSERT INTO workspace_invitations(id, workspace_id, email, role, token_hash, expires_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, id, workspaceId, email, role.name(), tokenHash, Timestamp.from(expiresAt), createdBy);
    }

    public Optional<InvitationRow> lockByHash(String tokenHash) {
        return jdbc.query("""
                SELECT id, workspace_id, email, role, expires_at, state
                FROM workspace_invitations WHERE token_hash = ? FOR UPDATE
                """, (rs, row) -> {
            Timestamp timestamp = rs.getTimestamp("expires_at");
            return new InvitationRow(
                    rs.getObject("id", UUID.class),
                    rs.getObject("workspace_id", UUID.class),
                    rs.getString("email"),
                    WorkspaceRole.valueOf(rs.getString("role")),
                    timestamp != null ? timestamp.toInstant() : null,
                    rs.getString("state")
            );
        }, tokenHash).stream().findFirst();
    }

    public int markAccepted(UUID id, UUID acceptedBy) {
        return jdbc.update("UPDATE workspace_invitations SET state = 'ACCEPTED', accepted_by = ? WHERE id = ?",
                acceptedBy, id);
    }

    public int revoke(UUID workspaceId, UUID id) {
        return jdbc.update("""
                UPDATE workspace_invitations SET state = 'REVOKED'
                WHERE workspace_id = ? AND id = ? AND state = 'PENDING'
                """, workspaceId, id);
    }
}
