package com.hybridflow.workspace.model;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Getter
@AllArgsConstructor
public class InvitationRow {
    private final UUID id;
    private final UUID workspaceId;
    private final String email;
    private final WorkspaceRole role;
    private final Instant expiresAt;
    private final String state;
}
