package com.hybridflow.workspace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.sync.dto.request.RunSyncRequest;

import java.util.UUID;

public interface TenantRunPlanService {
    RunSyncRequest createPlan(UUID workspaceId, String workflowId, JsonNode definition, String connectionReference);
    RunSyncRequest createPlan(UUID workspaceId, String workflowId, String definitionJson, String connectionReference);
    RunSyncRequest createPreviewPlan(UUID workspaceId, String workflowId, JsonNode definition, String connectionReference);
}
