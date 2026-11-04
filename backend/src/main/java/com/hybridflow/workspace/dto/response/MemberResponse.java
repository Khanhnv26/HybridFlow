package com.hybridflow.workspace.dto.response;

import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Getter
@AllArgsConstructor
public class MemberResponse {
    private final UUID workspaceId;
    private final UUID userId;
    private final String email;
    private final String displayName;
    private final WorkspaceRole role;
    private final Instant joinedAt;
}
