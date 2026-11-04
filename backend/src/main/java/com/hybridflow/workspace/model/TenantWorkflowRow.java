package com.hybridflow.workspace.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Getter
@AllArgsConstructor
@Builder
public class TenantWorkflowRow {
    private final String flowId;
    private final UUID workspaceId;
    private final UUID moduleId;
    private final String name;
    private final boolean enabled;
    private final long definitionVersion;
    private final String definitionJson;
    private final Instant nextRunAt;
    private final String scheduleType;
    private final int intervalMinutes;
    private final String dailyTime;
    private final String timezone;
    private final long scheduleRevision;
    private final Instant createdAt;
    private final Instant updatedAt;
}
