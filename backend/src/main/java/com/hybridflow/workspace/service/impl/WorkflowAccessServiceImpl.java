package com.hybridflow.workspace.service.impl;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.model.TenantWorkflowDiagnostic;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import com.hybridflow.workspace.service.WorkflowAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkflowAccessServiceImpl implements WorkflowAccessService {
    private final WorkspaceAccessService workspaces;
    private final TenantWorkflowRepository workflows;
    private final CurrentUserService currentUser;

    private void require(UUID workspaceId, String workflowId, String action) {
        WorkspaceRole role = workspaces.requireMember(workspaceId);
        if (!workflows.exists(workspaceId, workflowId)) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        if (role == WorkspaceRole.OWNER || role == WorkspaceRole.ADMIN) {
            return;
        }
        if (!"READ".equals(action) && role == WorkspaceRole.VIEWER) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
        if (!workflows.granted(workspaceId, workflowId, currentUser.requireUserId(), action)) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
    }

    @Override
    public void requireRead(UUID workspaceId, String workflowId) {
        require(workspaceId, workflowId, "READ");
    }

    @Override
    public void requireEdit(UUID workspaceId, String workflowId) {
        require(workspaceId, workflowId, "EDIT");
    }

    @Override
    public void requireOperate(UUID workspaceId, String workflowId) {
        require(workspaceId, workflowId, "RUN");
    }

    @Override
    public void requireRun(UUID workspaceId, String workflowId) {
        requireOperate(workspaceId, workflowId);
        TenantWorkflowDiagnostic diagnostic = workflows.findRunDiagnostic(workspaceId, workflowId)
                .orElse(null);
        if (diagnostic == null) {
            if (!workflows.runnable(workspaceId, workflowId)) {
                throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Module hoặc workflow đang tắt.");
            }
            return;
        }

        boolean wfOk = diagnostic.workflowEnabled();
        boolean modOk = diagnostic.moduleEnabled();

        if (!wfOk && !modOk) {
            String modName = diagnostic.moduleName() != null && !diagnostic.moduleName().isBlank() ? diagnostic.moduleName() : "Module";
            String wfName = diagnostic.workflowName() != null && !diagnostic.workflowName().isBlank() ? diagnostic.workflowName() : "Workflow";
            throw new ApplicationException(ErrorCode.STATE_CONFLICT,
                    String.format("Cả module '%s' và workflow '%s' đều đang tắt. Vui lòng bật lại để tiếp tục chạy luồng.", modName, wfName));
        }
        if (!wfOk) {
            String wfName = diagnostic.workflowName() != null && !diagnostic.workflowName().isBlank() ? diagnostic.workflowName() : "Workflow";
            throw new ApplicationException(ErrorCode.STATE_CONFLICT,
                    String.format("Workflow '%s' đang tắt. Vui lòng bật workflow trước khi chạy luồng.", wfName));
        }
        if (!modOk) {
            String modName = diagnostic.moduleName() != null && !diagnostic.moduleName().isBlank() ? diagnostic.moduleName() : "Module";
            throw new ApplicationException(ErrorCode.STATE_CONFLICT,
                    String.format("Module '%s' đang tắt. Vui lòng bật module trong phần quản lý để chạy workflow này.", modName));
        }
    }

    @Override
    public void requireContext(UUID workspaceId, String workflowId, String contextId) {
        requireRead(workspaceId, workflowId);
        if (!workflows.contextBelongs(workspaceId, workflowId, contextId)) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
    }
}
