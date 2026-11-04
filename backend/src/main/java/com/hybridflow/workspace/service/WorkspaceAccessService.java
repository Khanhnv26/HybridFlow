package com.hybridflow.workspace.service;

import com.hybridflow.workspace.model.WorkspaceRole;

import java.util.UUID;

public interface WorkspaceAccessService {
    WorkspaceRole requireMember(UUID workspaceId);
    void requireManager(UUID workspaceId);
    void requireOwner(UUID workspaceId);
}
