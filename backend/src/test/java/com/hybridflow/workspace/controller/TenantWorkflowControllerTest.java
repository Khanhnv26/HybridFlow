package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.sync.dto.request.ResolveConflictRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.workspace.dto.request.CreateWorkflowRequest;
import com.hybridflow.workspace.dto.request.GrantWorkflowPermissionRequest;
import com.hybridflow.workspace.dto.request.SaveWorkflowRequest;
import com.hybridflow.workspace.dto.request.UpdateWorkflowStatusRequest;
import com.hybridflow.workspace.dto.response.TenantWorkflowResponse;
import com.hybridflow.workspace.dto.response.WorkflowPermissionResponse;
import com.hybridflow.workspace.service.TenantWorkflowService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class TenantWorkflowControllerTest {
    @Mock
    private TenantWorkflowService service;
    @Mock
    private com.hybridflow.workspace.service.WorkflowWebhookService webhookService;

    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID moduleId = UUID.randomUUID();
    private final String workflowId = "flow-uuid-1";
    private final String contextId = "ctx-uuid-1";

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new TenantWorkflowController(service, webhookService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void createReturnsCreated() throws Exception {
        CreateWorkflowRequest request = new CreateWorkflowRequest();
        request.setModuleId(moduleId);
        request.setName("Daily Sync");

        TenantWorkflowResponse response = TenantWorkflowResponse.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .moduleId(moduleId)
                .name("Daily Sync")
                .build();
        when(service.create(eq(workspaceId), any())).thenReturn(response);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/workflows")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.flowId").value(workflowId))
                .andExpect(jsonPath("$.name").value("Daily Sync"));
    }

    @Test
    void updateReturnsUpdated() throws Exception {
        SaveWorkflowRequest request = new SaveWorkflowRequest();
        request.setName("Updated Sync");
        request.setExpectedVersion(1L);

        TenantWorkflowResponse response = TenantWorkflowResponse.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .name("Updated Sync")
                .definitionVersion(2L)
                .build();
        when(service.update(eq(workspaceId), eq(workflowId), any())).thenReturn(response);

        mvc.perform(put("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.definitionVersion").value(2));
    }

    @Test
    void updateStatusReturnsUpdated() throws Exception {
        UpdateWorkflowStatusRequest request = new UpdateWorkflowStatusRequest(true);

        TenantWorkflowResponse response = TenantWorkflowResponse.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .name("Daily Sync")
                .enabled(true)
                .build();
        when(service.updateStatus(eq(workspaceId), eq(workflowId), eq(true))).thenReturn(response);

        mvc.perform(put("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flowId").value(workflowId))
                .andExpect(jsonPath("$.enabled").value(true));
    }

    @Test
    void getReturnsWorkflow() throws Exception {
        TenantWorkflowResponse response = TenantWorkflowResponse.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .name("Daily Sync")
                .build();
        when(service.get(workspaceId, workflowId)).thenReturn(response);

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flowId").value(workflowId));
    }

    @Test
    void listReturnsWorkflows() throws Exception {
        TenantWorkflowResponse item = TenantWorkflowResponse.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .name("Daily Sync")
                .build();
        when(service.list(workspaceId)).thenReturn(List.of(item));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/workflows"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].flowId").value(workflowId));
    }

    @Test
    void cloneReturnsClonedWorkflow() throws Exception {
        TenantWorkflowResponse response = TenantWorkflowResponse.builder()
                .flowId("clone-id")
                .workspaceId(workspaceId)
                .name("Daily Sync (Copy)")
                .build();
        when(service.cloneWorkflow(workspaceId, workflowId)).thenReturn(response);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/clone"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flowId").value("clone-id"));
    }

    @Test
    void grantPermissionDelegatesToService() throws Exception {
        GrantWorkflowPermissionRequest request = new GrantWorkflowPermissionRequest();
        request.setUserId(UUID.randomUUID());
        request.setCanEdit(true);
        request.setCanRun(false);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        verify(service).grantPermission(eq(workspaceId), eq(workflowId), any());
    }

    @Test
    void permissionsReturnsList() throws Exception {
        WorkflowPermissionResponse item = new WorkflowPermissionResponse(
                workspaceId, workflowId, UUID.randomUUID(), true, false);
        when(service.permissions(workspaceId, workflowId)).thenReturn(List.of(item));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/permissions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].canEdit").value(true));
    }

    @Test
    void runReturnsSyncResponse() throws Exception {
        RunSyncResponse response = RunSyncResponse.builder()
                .flowId("flow-1")
                .totalRowsProcessed(5)
                .build();
        when(service.run(workspaceId, workflowId, false, null)).thenReturn(response);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/run"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRowsProcessed").value(5));
    }

    @Test
    void runReturnsConflictWhenSheetWritePreviewIsStale() throws Exception {
        when(service.run(workspaceId, workflowId, false, "old-plan"))
                .thenThrow(new ApplicationException(ErrorCode.STATE_CONFLICT));

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/run")
                        .header("X-Sheet-Write-Preview", "old-plan"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STATE_CONFLICT"));
    }

    @Test
    void notificationsReturnsOutboxList() throws Exception {
        NotificationOutboxItem item = NotificationOutboxItem.builder()
                .id("notif-1")
                .flowId(contextId)
                .channel("TELEGRAM")
                .build();
        when(service.notifications(eq(workspaceId), eq(workflowId), eq(contextId), eq("exec-1"), anyInt(), anyInt()))
                .thenReturn(List.of(item));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId
                + "/contexts/" + contextId + "/notifications")
                        .param("executionId", "exec-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("notif-1"));
    }

    @Test
    void retryNotificationDelegatesToService() throws Exception {
        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId
                + "/contexts/" + contextId + "/notifications/notif-1/retry"))
                .andExpect(status().isOk());

        verify(service).retryNotification(workspaceId, workflowId, contextId, "notif-1");
    }

    @Test
    void executionsReturnsHistory() throws Exception {
        when(service.executions(eq(workspaceId), eq(workflowId), anyInt(), anyInt()))
                .thenReturn(List.of(Map.of("id", "exec-1", "status", "SUCCESS")));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("exec-1"));
    }

    @Test
    void clearExecutionsDelegatesToService() throws Exception {
        mvc.perform(delete("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId + "/history"))
                .andExpect(status().isOk());

        verify(service).clearExecutions(workspaceId, workflowId);
    }

    @Test
    void conflictsReturnsConflictList() throws Exception {
        SyncConflict conflict = SyncConflict.builder()
                .id(1L)
                .flowId(contextId)
                .status("OPEN")
                .build();
        when(service.conflicts(workspaceId, workflowId, contextId)).thenReturn(List.of(conflict));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId
                + "/contexts/" + contextId + "/conflicts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1));
    }

    @Test
    void resolveConflictReturnsResolvedConflict() throws Exception {
        ResolveConflictRequest request = new ResolveConflictRequest();
        request.setResolvedValue("val-1");
        request.setAccessToken("token-1");
        SyncConflict conflict = SyncConflict.builder()
                .id(1L)
                .flowId(contextId)
                .status("RESOLVED")
                .build();
        when(service.resolveConflict(eq(workspaceId), eq(workflowId), eq(contextId), eq(1L), any()))
                .thenReturn(conflict);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/workflows/" + workflowId
                + "/contexts/" + contextId + "/conflicts/1/resolve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RESOLVED"));
    }
}
