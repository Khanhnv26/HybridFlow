package com.hybridflow.workspace.service;

import com.hybridflow.workspace.dto.request.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;

import java.util.List;

public interface WorkspaceService {
    WorkspaceResponse create(CreateWorkspaceRequest request);
    List<WorkspaceResponse> mine();
}
