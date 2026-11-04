package com.hybridflow.workspace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Getter
@AllArgsConstructor
public class ModuleResponse {
    private final UUID id;
    private final UUID workspaceId;
    private final String name;
    private final String description;
    private final boolean enabled;
    private final Instant createdAt;
}
