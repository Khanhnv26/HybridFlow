package com.hybridflow.workspace.support;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Getter
@AllArgsConstructor
public class PendingGoogleConnection {
    private final UUID workspaceId;
    private final UUID userId;
    private final String state;
    private final String name;
    private final Instant createdAt;
}
