package com.hybridflow.workspace.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
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
import com.hybridflow.workspace.dto.response.TenantWorkflowResponse;
import com.hybridflow.workspace.dto.response.WorkflowPermissionResponse;
import com.hybridflow.workspace.model.TenantWorkflowRow;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.repository.ModuleRepository;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.TenantRunPlanService;
import com.hybridflow.workspace.service.TenantWorkflowService;
import com.hybridflow.workspace.service.WorkflowAccessService;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TenantWorkflowServiceImpl implements TenantWorkflowService {
    private final TenantWorkflowRepository workflows;
    private final WorkspaceAccessService workspaces;
    private final WorkflowAccessService access;
    private final MembershipRepository members;
    private final ModuleRepository modules;
    private final WorkspaceConnectionRepository connections;
    private final CurrentUserService currentUser;
    private final AuditService audit;
    private final TenantRunPlanService planService;
    private final SyncExecutionService syncExecutionService;
    private final SyncConflictService syncConflictService;
    private final GoogleCredentialService credentials;
    private final WorkflowGraphParser parser;
    private final Clock clock;
    private final ObjectMapper mapper;
    private final SyncStateService syncState;

    @Override
    @Transactional
    public TenantWorkflowResponse create(UUID workspaceId, CreateWorkflowRequest request) {
        workspaces.requireManager(workspaceId);
        if (modules.find(workspaceId, request.getModuleId()).isEmpty()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        String workflowId = UUID.randomUUID().toString();
        String defaultDefinition = "{\"nodes\":[],\"edges\":[]}";
        workflows.insertWorkflow(workspaceId, request.getModuleId(), workflowId, request.getName().trim(), defaultDefinition);
        audit.append(workspaceId, currentUser.requireUserId(), "WORKFLOW_CREATED", workflowId);
        return get(workspaceId, workflowId);
    }

    @Override
    @Transactional
    public TenantWorkflowResponse update(UUID workspaceId, String workflowId, SaveWorkflowRequest request) {
        access.requireEdit(workspaceId, workflowId);
        TenantWorkflowRow existing = workflows.findWorkflow(workspaceId, workflowId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));

        if (request.getModuleId() != null && modules.find(workspaceId, request.getModuleId()).isEmpty()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        WorkspaceRole callerRole = workspaces.requireMember(workspaceId);
        if (request.getConnectionBindings() != null) {
            for (ConnectionBindingItem binding : request.getConnectionBindings()) {
                Optional<String> state = connections.findState(workspaceId, binding.getConnectionId());
                if (state.isEmpty() || !"ACTIVE".equals(state.get())) {
                    throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
                }
                if (callerRole == WorkspaceRole.EDITOR && !connections.hasEditorGrant(workspaceId, binding.getConnectionId())) {
                    throw new ApplicationException(ErrorCode.ACCESS_DENIED);
                }
            }
        }

        String defJson = request.getDefinition() != null ? request.getDefinition().toString() : existing.getDefinitionJson();
        ParsedSchedule schedule = parser.extractSchedule(request.getDefinition(), clock.instant());
        long scheduleRevision = existing.getScheduleRevision();
        if (!Objects.equals(schedule.getScheduleType(), existing.getScheduleType())
                || schedule.getIntervalMinutes() != existing.getIntervalMinutes()
                || !Objects.equals(schedule.getDailyTime(), existing.getDailyTime())
                || !Objects.equals(schedule.getTimezone(), existing.getTimezone())) {
            scheduleRevision++;
        }

        int changed = workflows.updateWorkflow(workspaceId, workflowId, request.getExpectedVersion(), defJson,
                request.getName(), request.getModuleId(), request.getEnabled(), schedule.getScheduleType(),
                schedule.getIntervalMinutes(), schedule.getDailyTime(), schedule.getNextRunAt(),
                schedule.getTimezone(), scheduleRevision);
        if (changed == 0) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Phiên bản workflow đã bị thay đổi hoặc không khớp.");
        }

        if (request.getConnectionBindings() != null) {
            workflows.replaceBindings(workspaceId, workflowId, request.getConnectionBindings());
        }

        audit.append(workspaceId, currentUser.requireUserId(), "WORKFLOW_UPDATED", workflowId);
        return get(workspaceId, workflowId);
    }

    @Override
    @Transactional(readOnly = true)
    public TenantWorkflowResponse get(UUID workspaceId, String workflowId) {
        access.requireRead(workspaceId, workflowId);
        TenantWorkflowRow row = workflows.findWorkflow(workspaceId, workflowId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
        List<ConnectionBindingItem> bindings = workflows.findBindings(workspaceId, workflowId);
        JsonNode definitionNode = null;
        try {
            definitionNode = mapper.readTree(row.getDefinitionJson());
        } catch (Exception ignored) {
        }
        return TenantWorkflowResponse.builder()
                .flowId(row.getFlowId())
                .workspaceId(row.getWorkspaceId())
                .moduleId(row.getModuleId())
                .name(row.getName())
                .enabled(row.isEnabled())
                .definitionVersion(row.getDefinitionVersion())
                .definition(definitionNode)
                .connectionBindings(bindings)
                .nextRunAt(row.getNextRunAt())
                .scheduleType(row.getScheduleType())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TenantWorkflowResponse> list(UUID workspaceId) {
        WorkspaceRole role = workspaces.requireMember(workspaceId);
        List<TenantWorkflowRow> all = workflows.listWorkflows(workspaceId);
        UUID userId = currentUser.requireUserId();
        List<TenantWorkflowResponse> result = new ArrayList<>();
        for (TenantWorkflowRow row : all) {
            if (role == WorkspaceRole.OWNER || role == WorkspaceRole.ADMIN
                    || workflows.granted(workspaceId, row.getFlowId(), userId, "READ")) {
                List<ConnectionBindingItem> bindings = workflows.findBindings(workspaceId, row.getFlowId());
                JsonNode defNode = null;
                try {
                    defNode = mapper.readTree(row.getDefinitionJson());
                } catch (Exception ignored) {
                }
                result.add(TenantWorkflowResponse.builder()
                        .flowId(row.getFlowId())
                        .workspaceId(row.getWorkspaceId())
                        .moduleId(row.getModuleId())
                        .name(row.getName())
                        .enabled(row.isEnabled())
                        .definitionVersion(row.getDefinitionVersion())
                        .definition(defNode)
                        .connectionBindings(bindings)
                        .nextRunAt(row.getNextRunAt())
                        .scheduleType(row.getScheduleType())
                        .build());
            }
        }
        return result;
    }

    @Override
    @Transactional
    public TenantWorkflowResponse cloneWorkflow(UUID workspaceId, String workflowId) {
        access.requireRead(workspaceId, workflowId);
        WorkspaceRole callerRole = workspaces.requireMember(workspaceId);
        if (callerRole != WorkspaceRole.OWNER && callerRole != WorkspaceRole.ADMIN) {
            access.requireEdit(workspaceId, workflowId);
        }
        TenantWorkflowRow existing = workflows.findWorkflow(workspaceId, workflowId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));

        String newWorkflowId = UUID.randomUUID().toString();
        workflows.insertWorkflow(workspaceId, existing.getModuleId(), newWorkflowId,
                existing.getName() + " (Copy)", existing.getDefinitionJson());

        List<ConnectionBindingItem> existingBindings = workflows.findBindings(workspaceId, workflowId);
        workflows.replaceBindings(workspaceId, newWorkflowId, existingBindings);

        if (callerRole == WorkspaceRole.EDITOR) {
            workflows.upsertPermission(workspaceId, newWorkflowId, currentUser.requireUserId(), true, true);
        }

        audit.append(workspaceId, currentUser.requireUserId(), "WORKFLOW_CLONED", newWorkflowId);
        return get(workspaceId, newWorkflowId);
    }

    @Override
    @Transactional
    public void grantPermission(UUID workspaceId, String workflowId, GrantWorkflowPermissionRequest request) {
        workspaces.requireManager(workspaceId);
        if (!workflows.exists(workspaceId, workflowId)) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        Optional<WorkspaceRole> targetRole = members.findRole(workspaceId, request.getUserId());
        if (targetRole.isEmpty()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        boolean canEdit = request.isCanEdit();
        boolean canRun = request.isCanRun();
        if (targetRole.get() == WorkspaceRole.VIEWER) {
            canEdit = false;
            canRun = false;
        }
        workflows.upsertPermission(workspaceId, workflowId, request.getUserId(), canEdit, canRun);
        audit.append(workspaceId, currentUser.requireUserId(), "WORKFLOW_PERMISSION_GRANTED", workflowId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkflowPermissionResponse> permissions(UUID workspaceId, String workflowId) {
        access.requireRead(workspaceId, workflowId);
        return workflows.findPermissions(workspaceId, workflowId);
    }

    @Override
    @Transactional
    public RunSyncResponse run(UUID workspaceId, String workflowId) {
        return run(workspaceId, workflowId, false);
    }

    @Override
    @Transactional
    public RunSyncResponse run(UUID workspaceId, String workflowId, boolean bootstrapConfirmed) {
        access.requireRun(workspaceId, workflowId);
        TenantWorkflowRow row = workflows.findWorkflow(workspaceId, workflowId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
        String accessToken = googleAccessForWorkflow(workspaceId, workflowId);
        RunSyncRequest plan = planService.createPlan(workspaceId, workflowId, row.getDefinitionJson(), accessToken);
        plan.setBootstrapConfirmed(bootstrapConfirmed);
        RunSyncResponse response = syncExecutionService.executeSync(plan);
        audit.append(workspaceId, currentUser.requireUserId(), "WORKFLOW_RUN", workflowId);
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SyncConflict> conflicts(UUID workspaceId, String workflowId) {
        access.requireRead(workspaceId, workflowId);
        List<SyncConflict> conflicts = new ArrayList<>();
        for (String contextId : workflows.findContextIds(workspaceId, workflowId)) {
            conflicts.addAll(workflows.findConflicts(workspaceId, workflowId, contextId));
        }
        return conflicts;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Map<String, String>> vault(UUID workspaceId, String workflowId, String contextId) {
        access.requireContext(workspaceId, workflowId, contextId);
        return syncState.getVaultRecords(contextId);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> schedule(UUID workspaceId, String workflowId) {
        access.requireRead(workspaceId, workflowId);
        return workflows.scheduleStatus(workspaceId, workflowId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<NotificationOutboxItem> notifications(UUID workspaceId, String workflowId, String contextId,
                                                      String executionId, int limit, int offset) {
        access.requireContext(workspaceId, workflowId, contextId);
        return workflows.findNotifications(workspaceId, workflowId, contextId, executionId, limit, offset);
    }

    @Override
    @Transactional
    public void retryNotification(UUID workspaceId, String workflowId, String contextId, String notificationId) {
        access.requireContext(workspaceId, workflowId, contextId);
        access.requireOperate(workspaceId, workflowId);
        if (!workflows.isNotificationInScope(workspaceId, workflowId, notificationId)) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        int changed = workflows.retryNotification(workspaceId, workflowId, notificationId);
        if (changed == 0) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Thông báo không ở trạng thái có thể thử lại.");
        }
        audit.append(workspaceId, currentUser.requireUserId(), "NOTIFICATION_RETRIED", notificationId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Map<String, Object>> executions(UUID workspaceId, String workflowId, int limit, int offset) {
        access.requireRead(workspaceId, workflowId);
        return workflows.findExecutions(workspaceId, workflowId, limit, offset);
    }

    @Override
    @Transactional
    public void clearExecutions(UUID workspaceId, String workflowId) {
        access.requireEdit(workspaceId, workflowId);
        workflows.clearExecutions(workspaceId, workflowId);
        audit.append(workspaceId, currentUser.requireUserId(), "WORKFLOW_HISTORY_CLEARED", workflowId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SyncConflict> conflicts(UUID workspaceId, String workflowId, String contextId) {
        access.requireContext(workspaceId, workflowId, contextId);
        return workflows.findConflicts(workspaceId, workflowId, contextId);
    }

    @Override
    @Transactional
    public SyncConflict resolveConflict(UUID workspaceId, String workflowId, String contextId, Long conflictId,
                                        ResolveConflictRequest request) {
        access.requireContext(workspaceId, workflowId, contextId);
        access.requireEdit(workspaceId, workflowId);
        workflows.findConflict(workspaceId, workflowId, contextId, conflictId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
        String accessToken = googleAccessForWorkflow(workspaceId, workflowId);
        SyncConflict resolved = syncConflictService.resolveConflict(conflictId, request.getResolvedValue(), accessToken);
        audit.append(workspaceId, currentUser.requireUserId(), "CONFLICT_RESOLVED", conflictId.toString());
        return resolved;
    }

    private String googleAccessForWorkflow(UUID workspaceId, String workflowId) {
        WorkspaceRole role = workspaces.requireMember(workspaceId);
        String reference = null;
        for (ConnectionBindingItem binding : workflows.findBindings(workspaceId, workflowId)) {
            if (role == WorkspaceRole.EDITOR && !connections.hasEditorGrant(workspaceId, binding.getConnectionId())) {
                throw new ApplicationException(ErrorCode.ACCESS_DENIED);
            }
            Optional<String> google = connections.findGoogleConnectionId(workspaceId, binding.getConnectionId());
            if (google.isPresent()) {
                if (reference != null && !reference.equals(google.get())) {
                    throw new ValidationException("Các nguồn trong một luồng cần dùng cùng kết nối Google.");
                }
                reference = google.get();
            }
        }
        if (reference == null) throw new ApplicationException(ErrorCode.CONNECTION_REQUIRED);
        return credentials.resolveAccessToken(reference);
    }
}
