package com.hybridflow.workspace.dto.response;

import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Getter
public class MemberResponse {
    private final UUID workspaceId;
    private final UUID userId;
    private final String email;
    private final String displayName;
    private final String avatarUrl;
    private final WorkspaceRole role;
    private final Instant joinedAt;

    public MemberResponse(UUID workspaceId, UUID userId, String email, String displayName, WorkspaceRole role, Instant joinedAt) {
        this(workspaceId, userId, email, displayName, null, role, joinedAt);
    }

    public MemberResponse(UUID workspaceId, UUID userId, String email, String displayName, String avatarUrl, WorkspaceRole role, Instant joinedAt) {
        this.workspaceId = workspaceId;
        this.userId = userId;
        this.email = email;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
        this.role = role;
        this.joinedAt = joinedAt;
    }
}
