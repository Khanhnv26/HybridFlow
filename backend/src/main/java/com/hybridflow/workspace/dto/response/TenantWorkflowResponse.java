package com.hybridflow.workspace.dto.response;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.workspace.dto.request.ConnectionBindingItem;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Getter
@AllArgsConstructor
@Builder
public class TenantWorkflowResponse {
    private final String flowId;
    private final UUID workspaceId;
    private final UUID moduleId;
    private final String name;
    private final boolean enabled;
    private final long definitionVersion;
    private final JsonNode definition;
    private final List<ConnectionBindingItem> connectionBindings;
    private final Instant nextRunAt;
    private final String scheduleType;
}
