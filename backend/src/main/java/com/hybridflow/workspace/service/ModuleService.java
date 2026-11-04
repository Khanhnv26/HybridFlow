package com.hybridflow.workspace.service;

import com.hybridflow.workspace.dto.request.SaveModuleRequest;
import com.hybridflow.workspace.dto.response.ModuleResponse;

import java.util.List;
import java.util.UUID;

public interface ModuleService {
    ModuleResponse create(UUID workspaceId, SaveModuleRequest request);
    ModuleResponse update(UUID workspaceId, UUID moduleId, SaveModuleRequest request);
    List<ModuleResponse> list(UUID workspaceId);
}
