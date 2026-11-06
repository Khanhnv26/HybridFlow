package com.hybridflow.workspace.service;

import com.hybridflow.sync.dto.request.ResolveConflictRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.workspace.dto.request.CreateWorkflowRequest;
import com.hybridflow.workspace.dto.request.GrantWorkflowPermissionRequest;
import com.hybridflow.workspace.dto.request.SaveWorkflowRequest;
import com.hybridflow.workspace.dto.response.TenantWorkflowResponse;
import com.hybridflow.workspace.dto.response.WorkflowPermissionResponse;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface TenantWorkflowService {
    TenantWorkflowResponse create(UUID workspaceId, CreateWorkflowRequest request);
    TenantWorkflowResponse update(UUID workspaceId, String workflowId, SaveWorkflowRequest request);
    TenantWorkflowResponse updateStatus(UUID workspaceId, String workflowId, boolean enabled);
    TenantWorkflowResponse get(UUID workspaceId, String workflowId);
    List<TenantWorkflowResponse> list(UUID workspaceId);
    TenantWorkflowResponse cloneWorkflow(UUID workspaceId, String workflowId);
    void grantPermission(UUID workspaceId, String workflowId, GrantWorkflowPermissionRequest request);
    List<WorkflowPermissionResponse> permissions(UUID workspaceId, String workflowId);
    RunSyncResponse run(UUID workspaceId, String workflowId);
    RunSyncResponse run(UUID workspaceId, String workflowId, boolean bootstrapConfirmed);
    List<SyncConflict> conflicts(UUID workspaceId, String workflowId);
    List<Map<String, String>> vault(UUID workspaceId, String workflowId, String contextId);
    Map<String, Object> schedule(UUID workspaceId, String workflowId);
    List<NotificationOutboxItem> notifications(UUID workspaceId, String workflowId, String contextId, String executionId, int limit, int offset);
    void retryNotification(UUID workspaceId, String workflowId, String contextId, String notificationId);
    List<Map<String, Object>> executions(UUID workspaceId, String workflowId, int limit, int offset);
    void clearExecutions(UUID workspaceId, String workflowId);
    List<SyncConflict> conflicts(UUID workspaceId, String workflowId, String contextId);
    SyncConflict resolveConflict(UUID workspaceId, String workflowId, String contextId, Long conflictId, ResolveConflictRequest request);
}
