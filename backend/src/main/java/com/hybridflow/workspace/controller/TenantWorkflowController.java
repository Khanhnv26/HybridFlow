package com.hybridflow.workspace.controller;

import com.hybridflow.sync.dto.request.ResolveConflictRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.workspace.dto.request.*;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;
import com.hybridflow.workspace.dto.response.TenantWorkflowResponse;
import com.hybridflow.workspace.dto.response.WorkflowPermissionResponse;
import com.hybridflow.workspace.service.TenantWorkflowService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces/{workspaceId}/workflows")
public class TenantWorkflowController {
    private final TenantWorkflowService service;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TenantWorkflowResponse create(@PathVariable UUID workspaceId,
                                         @Valid @RequestBody CreateWorkflowRequest request) {
        return service.create(workspaceId, request);
    }

    @PutMapping("/{workflowId}")
    public TenantWorkflowResponse update(@PathVariable UUID workspaceId,
                                         @PathVariable String workflowId,
                                         @Valid @RequestBody SaveWorkflowRequest request) {
        return service.update(workspaceId, workflowId, request);
    }

    @PutMapping("/{workflowId}/status")
    public TenantWorkflowResponse updateStatus(@PathVariable UUID workspaceId,
                                               @PathVariable String workflowId,
                                               @Valid @RequestBody UpdateWorkflowStatusRequest request) {
        return service.updateStatus(workspaceId, workflowId, request.getEnabled());
    }

    @GetMapping("/{workflowId}")
    public TenantWorkflowResponse get(@PathVariable UUID workspaceId,
                                      @PathVariable String workflowId) {
        return service.get(workspaceId, workflowId);
    }

    @GetMapping
    public List<TenantWorkflowResponse> list(@PathVariable UUID workspaceId) {
        return service.list(workspaceId);
    }

    @PostMapping("/{workflowId}/clone")
    public TenantWorkflowResponse cloneWorkflow(@PathVariable UUID workspaceId,
                                                @PathVariable String workflowId) {
        return service.cloneWorkflow(workspaceId, workflowId);
    }

    @PostMapping("/{workflowId}/permissions")
    public void grantPermission(@PathVariable UUID workspaceId,
                                @PathVariable String workflowId,
                                @Valid @RequestBody GrantWorkflowPermissionRequest request) {
        service.grantPermission(workspaceId, workflowId, request);
    }

    @GetMapping("/{workflowId}/permissions")
    public List<WorkflowPermissionResponse> permissions(@PathVariable UUID workspaceId,
                                                        @PathVariable String workflowId) {
        return service.permissions(workspaceId, workflowId);
    }

    @PostMapping("/{workflowId}/run")
    public RunSyncResponse run(@PathVariable UUID workspaceId,
                               @PathVariable String workflowId,
                               @RequestParam(defaultValue = "false") boolean bootstrapConfirmed,
                               @RequestHeader(value = "X-Sheet-Write-Preview", required = false) String previewToken) {
        return service.run(workspaceId, workflowId, bootstrapConfirmed, previewToken);
    }

    @GetMapping("/{workflowId}/conflicts")
    public List<SyncConflict> allConflicts(@PathVariable UUID workspaceId, @PathVariable String workflowId) {
        return service.conflicts(workspaceId, workflowId);
    }

    @GetMapping("/{workflowId}/schedule")
    public Map<String, Object> schedule(@PathVariable UUID workspaceId, @PathVariable String workflowId) {
        return service.schedule(workspaceId, workflowId);
    }

    @GetMapping("/{workflowId}/contexts/{contextId}/vault")
    public List<Map<String, String>> vault(@PathVariable UUID workspaceId, @PathVariable String workflowId,
                                         @PathVariable String contextId) {
        return service.vault(workspaceId, workflowId, contextId);
    }

    @GetMapping("/{workflowId}/contexts/{contextId}/notifications")
    public List<NotificationOutboxItem> notifications(@PathVariable UUID workspaceId,
                                                      @PathVariable String workflowId,
                                                      @PathVariable String contextId,
                                                      @RequestParam String executionId,
                                                      @RequestParam(defaultValue = "50") int limit,
                                                      @RequestParam(defaultValue = "0") int offset) {
        return service.notifications(workspaceId, workflowId, contextId, executionId, limit, offset);
    }

    @PostMapping("/{workflowId}/contexts/{contextId}/notifications/{notificationId}/retry")
    public void retryNotification(@PathVariable UUID workspaceId,
                                  @PathVariable String workflowId,
                                  @PathVariable String contextId,
                                  @PathVariable String notificationId) {
        service.retryNotification(workspaceId, workflowId, contextId, notificationId);
    }

    @GetMapping("/{workflowId}/history")
    public List<Map<String, Object>> executions(@PathVariable UUID workspaceId,
                                                @PathVariable String workflowId,
                                                @RequestParam(defaultValue = "50") int limit,
                                                @RequestParam(defaultValue = "0") int offset) {
        return service.executions(workspaceId, workflowId, limit, offset);
    }

    @DeleteMapping("/{workflowId}/history")
    public void clearExecutions(@PathVariable UUID workspaceId,
                                @PathVariable String workflowId) {
        service.clearExecutions(workspaceId, workflowId);
    }

    @GetMapping("/{workflowId}/contexts/{contextId}/conflicts")
    public List<SyncConflict> conflicts(@PathVariable UUID workspaceId,
                                        @PathVariable String workflowId,
                                        @PathVariable String contextId) {
        return service.conflicts(workspaceId, workflowId, contextId);
    }

    @PostMapping("/{workflowId}/contexts/{contextId}/conflicts/{conflictId}/resolve")
    public SyncConflict resolveConflict(@PathVariable UUID workspaceId,
                                        @PathVariable String workflowId,
                                        @PathVariable String contextId,
                                        @PathVariable Long conflictId,
                                        @Valid @RequestBody ResolveConflictRequest request) {
        return service.resolveConflict(workspaceId, workflowId, contextId, conflictId, request);
    }

    @PostMapping("/{workflowId}/sheet-write/preview")
    public SheetWritePreviewResponse previewSheetWrite(@PathVariable UUID workspaceId,
                                                       @PathVariable String workflowId,
                                                       @Valid @RequestBody SheetWritePreviewRequest request) {
        return service.previewSheetWrite(workspaceId, workflowId, request);
    }

}
