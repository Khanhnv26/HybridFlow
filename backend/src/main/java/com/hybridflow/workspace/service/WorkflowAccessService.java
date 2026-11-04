package com.hybridflow.workspace.service;

import java.util.UUID;

public interface WorkflowAccessService {
    void requireRead(UUID workspaceId, String workflowId);
    void requireEdit(UUID workspaceId, String workflowId);
    void requireOperate(UUID workspaceId, String workflowId);
    void requireRun(UUID workspaceId, String workflowId);
    void requireContext(UUID workspaceId, String workflowId, String contextId);
}
