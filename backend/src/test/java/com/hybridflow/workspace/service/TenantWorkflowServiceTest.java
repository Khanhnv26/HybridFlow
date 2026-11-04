package com.hybridflow.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.sync.dto.request.ResolveConflictRequest;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.model.ParsedSchedule;
import com.hybridflow.sync.service.SyncConflictService;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.SyncStateService;
import com.hybridflow.sync.support.WorkflowGraphParser;
import com.hybridflow.workspace.dto.request.ConnectionBindingItem;
import com.hybridflow.workspace.dto.request.CreateWorkflowRequest;
import com.hybridflow.workspace.dto.request.GrantWorkflowPermissionRequest;
import com.hybridflow.workspace.dto.request.SaveWorkflowRequest;
import com.hybridflow.workspace.dto.response.ModuleResponse;
import com.hybridflow.workspace.dto.response.TenantWorkflowResponse;
import com.hybridflow.workspace.model.TenantWorkflowRow;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.repository.ModuleRepository;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.impl.TenantWorkflowServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TenantWorkflowServiceTest {
    @Mock
    private TenantWorkflowRepository workflows;
    @Mock
    private WorkspaceAccessService workspaces;
    @Mock
    private WorkflowAccessService access;
    @Mock
    private MembershipRepository members;
    @Mock
    private ModuleRepository modules;
    @Mock
    private WorkspaceConnectionRepository connections;
    @Mock
    private CurrentUserService currentUser;
    @Mock
    private AuditService audit;
    @Mock
    private TenantRunPlanService planService;
    @Mock
    private SyncExecutionService syncExecutionService;
    @Mock
    private SyncConflictService syncConflictService;
    @Mock
    private GoogleCredentialService credentials;
    @Mock
    private WorkflowGraphParser parser;

    private final Clock clock = Clock.fixed(Instant.parse("2026-11-04T00:00:00Z"), ZoneId.of("UTC"));
    private final ObjectMapper mapper = new ObjectMapper();

    private TenantWorkflowService service;

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID moduleId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final String workflowId = "flow-uuid-1";
    @Mock private SyncStateService syncState;

    @BeforeEach
    void setup() {
        service = new TenantWorkflowServiceImpl(
                workflows, workspaces, access, members, modules, connections,
                currentUser, audit, planService, syncExecutionService,
                syncConflictService, credentials, parser, clock, mapper, syncState);
    }

    @Test
    void createThrowsNotFoundWhenModuleMissing() {
        CreateWorkflowRequest request = new CreateWorkflowRequest();
        request.setModuleId(moduleId);
        request.setName("Daily Sync");

        when(modules.find(workspaceId, moduleId)).thenReturn(Optional.empty());

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.create(workspaceId, request));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
        verify(workspaces).requireManager(workspaceId);
    }

    @Test
    void createInsertsWorkflowAndAudits() {
        CreateWorkflowRequest request = new CreateWorkflowRequest();
        request.setModuleId(moduleId);
        request.setName("Daily Sync");

        when(modules.find(workspaceId, moduleId)).thenReturn(Optional.of(
                new ModuleResponse(moduleId, workspaceId, "Daily Sync", "", true, Instant.now())));
        when(currentUser.requireUserId()).thenReturn(userId);

        TenantWorkflowRow createdRow = TenantWorkflowRow.builder()
                .flowId("new-id")
                .workspaceId(workspaceId)
                .moduleId(moduleId)
                .name("Daily Sync")
                .enabled(false)
                .definitionVersion(1L)
                .definitionJson("{\"nodes\":[],\"edges\":[]}")
                .build();
        when(workflows.findWorkflow(eq(workspaceId), any())).thenReturn(Optional.of(createdRow));

        TenantWorkflowResponse response = service.create(workspaceId, request);

        assertNotNull(response);
        assertEquals("Daily Sync", response.getName());
        verify(workflows).insertWorkflow(eq(workspaceId), eq(moduleId), anyString(), eq("Daily Sync"), anyString());
        verify(audit).append(eq(workspaceId), eq(userId), eq("WORKFLOW_CREATED"), anyString());
    }

    @Test
    void updateThrowsConflictWhenVersionMismatched() {
        SaveWorkflowRequest request = new SaveWorkflowRequest();
        request.setExpectedVersion(1L);
        request.setName("Renamed");

        TenantWorkflowRow existing = TenantWorkflowRow.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .definitionVersion(2L)
                .scheduleRevision(1L)
                .build();
        when(workflows.findWorkflow(workspaceId, workflowId)).thenReturn(Optional.of(existing));
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.ADMIN);
        when(parser.extractSchedule(any(), any())).thenReturn(ParsedSchedule.disable());
        when(workflows.updateWorkflow(eq(workspaceId), eq(workflowId), eq(1L), any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), anyLong()))
                .thenReturn(0);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.update(workspaceId, workflowId, request));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void updateChecksConnectionBindingsForEditor() {
        SaveWorkflowRequest request = new SaveWorkflowRequest();
        request.setExpectedVersion(1L);
        ConnectionBindingItem binding = new ConnectionBindingItem("node-1", "conn-1");
        request.setConnectionBindings(List.of(binding));

        TenantWorkflowRow existing = TenantWorkflowRow.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .definitionVersion(1L)
                .scheduleRevision(1L)
                .build();
        when(workflows.findWorkflow(workspaceId, workflowId)).thenReturn(Optional.of(existing));
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.EDITOR);
        when(connections.findState(workspaceId, "conn-1")).thenReturn(Optional.of("ACTIVE"));
        when(connections.hasEditorGrant(workspaceId, "conn-1")).thenReturn(false);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.update(workspaceId, workflowId, request));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void listFiltersOutWorkflowsWithoutGrantsForEditor() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.EDITOR);
        when(currentUser.requireUserId()).thenReturn(userId);

        TenantWorkflowRow wf1 = TenantWorkflowRow.builder().flowId("wf-1").workspaceId(workspaceId).name("WF 1").build();
        TenantWorkflowRow wf2 = TenantWorkflowRow.builder().flowId("wf-2").workspaceId(workspaceId).name("WF 2").build();
        when(workflows.listWorkflows(workspaceId)).thenReturn(List.of(wf1, wf2));
        when(workflows.granted(workspaceId, "wf-1", userId, "READ")).thenReturn(true);
        when(workflows.granted(workspaceId, "wf-2", userId, "READ")).thenReturn(false);

        List<TenantWorkflowResponse> list = service.list(workspaceId);

        assertEquals(1, list.size());
        assertEquals("wf-1", list.get(0).getFlowId());
    }

    @Test
    void cloneDuplicatesWorkflowAndBindings() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.ADMIN);
        when(currentUser.requireUserId()).thenReturn(userId);

        TenantWorkflowRow existing = TenantWorkflowRow.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .moduleId(moduleId)
                .name("Original")
                .definitionJson("{}")
                .build();
        when(workflows.findWorkflow(workspaceId, workflowId)).thenReturn(Optional.of(existing));
        when(workflows.findBindings(workspaceId, workflowId)).thenReturn(List.of(new ConnectionBindingItem("n1", "c1")));

        TenantWorkflowRow clonedRow = TenantWorkflowRow.builder()
                .flowId("clone-id")
                .workspaceId(workspaceId)
                .moduleId(moduleId)
                .name("Original (Copy)")
                .definitionJson("{}")
                .build();
        when(workflows.findWorkflow(eq(workspaceId), argThat(id -> !workflowId.equals(id)))).thenReturn(Optional.of(clonedRow));

        TenantWorkflowResponse response = service.cloneWorkflow(workspaceId, workflowId);

        assertNotNull(response);
        verify(workflows).insertWorkflow(eq(workspaceId), eq(moduleId), anyString(), eq("Original (Copy)"), eq("{}"));
        verify(workflows).replaceBindings(eq(workspaceId), anyString(), any());
        verify(audit).append(eq(workspaceId), eq(userId), eq("WORKFLOW_CLONED"), anyString());
    }

    @Test
    void grantPermissionDowngradesForViewer() {
        UUID targetUser = UUID.randomUUID();
        GrantWorkflowPermissionRequest request = new GrantWorkflowPermissionRequest();
        request.setUserId(targetUser);
        request.setCanEdit(true);
        request.setCanRun(true);

        when(currentUser.requireUserId()).thenReturn(userId);
        when(workflows.exists(workspaceId, workflowId)).thenReturn(true);
        when(members.findRole(workspaceId, targetUser)).thenReturn(Optional.of(WorkspaceRole.VIEWER));

        service.grantPermission(workspaceId, workflowId, request);

        verify(workflows).upsertPermission(workspaceId, workflowId, targetUser, false, false);
        verify(audit).append(workspaceId, userId, "WORKFLOW_PERMISSION_GRANTED", workflowId);
    }

    @Test
    void runResolvesTokenAndExecutesSync() {
        when(currentUser.requireUserId()).thenReturn(userId);
        TenantWorkflowRow existing = TenantWorkflowRow.builder()
                .flowId(workflowId)
                .workspaceId(workspaceId)
                .definitionJson("{}")
                .build();
        when(workflows.findWorkflow(workspaceId, workflowId)).thenReturn(Optional.of(existing));
        when(workflows.findBindings(workspaceId, workflowId))
                .thenReturn(List.of(new ConnectionBindingItem("n1", "conn-1")));
        when(connections.findGoogleConnectionId(workspaceId, "conn-1")).thenReturn(Optional.of("gconn-1"));
        when(credentials.resolveAccessToken("gconn-1")).thenReturn("access-token-123");

        RunSyncRequest plan = new RunSyncRequest();
        when(planService.createPlan(workspaceId, workflowId, "{}", "access-token-123")).thenReturn(plan);
        RunSyncResponse runResponse = RunSyncResponse.builder().flowId("flow-1").totalRowsProcessed(10).build();
        when(syncExecutionService.executeSync(plan)).thenReturn(runResponse);

        RunSyncResponse result = service.run(workspaceId, workflowId, true);

        assertNotNull(result);
        assertEquals(10, result.getTotalRowsProcessed());
        assertEquals(true, plan.isBootstrapConfirmed());
        verify(access).requireRun(workspaceId, workflowId);
        verify(audit).append(workspaceId, userId, "WORKFLOW_RUN", workflowId);
    }

    @Test
    void retryNotificationFailsWhenOutOfScope() {
        when(workflows.isNotificationInScope(workspaceId, workflowId, "notif-1")).thenReturn(false);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.retryNotification(workspaceId, workflowId, "ctx-1", "notif-1"));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }

    @Test
    void retryNotificationDelegatesAndAudits() {
        when(currentUser.requireUserId()).thenReturn(userId);
        when(workflows.isNotificationInScope(workspaceId, workflowId, "notif-1")).thenReturn(true);
        when(workflows.retryNotification(workspaceId, workflowId, "notif-1")).thenReturn(1);

        service.retryNotification(workspaceId, workflowId, "ctx-1", "notif-1");

        verify(access).requireContext(workspaceId, workflowId, "ctx-1");
        verify(access).requireOperate(workspaceId, workflowId);
        verify(workflows).retryNotification(workspaceId, workflowId, "notif-1");
        verify(audit).append(workspaceId, userId, "NOTIFICATION_RETRIED", "notif-1");
    }

    @Test
    void resolveConflictThrowsNotFoundWhenConflictMissing() {
        ResolveConflictRequest request = new ResolveConflictRequest();
        request.setResolvedValue("val-1");
        request.setAccessToken("token-1");
        when(workflows.findConflict(workspaceId, workflowId, "ctx-1", 99L)).thenReturn(Optional.empty());

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.resolveConflict(workspaceId, workflowId, "ctx-1", 99L, request));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }

    @Test
    void resolveConflictDelegatesToSyncConflictServiceAndAudits() {
        when(currentUser.requireUserId()).thenReturn(userId);
        SyncConflict conflict = SyncConflict.builder().id(99L).flowId("ctx-1").build();
        when(workflows.findConflict(workspaceId, workflowId, "ctx-1", 99L)).thenReturn(Optional.of(conflict));
        when(workflows.findBindings(workspaceId, workflowId)).thenReturn(List.of(new ConnectionBindingItem("sheet", "owned")));
        when(connections.findGoogleConnectionId(workspaceId, "owned")).thenReturn(Optional.of("owned"));
        when(credentials.resolveAccessToken("owned")).thenReturn("workspace-token");

        ResolveConflictRequest request = new ResolveConflictRequest();
        request.setResolvedValue("val-1");
        request.setAccessToken("token-1");
        service.resolveConflict(workspaceId, workflowId, "ctx-1", 99L, request);

        verify(access).requireContext(workspaceId, workflowId, "ctx-1");
        verify(access).requireEdit(workspaceId, workflowId);
        verify(syncConflictService).resolveConflict(99L, "val-1", "workspace-token");
        verify(audit).append(workspaceId, userId, "CONFLICT_RESOLVED", "99");
    }
}
