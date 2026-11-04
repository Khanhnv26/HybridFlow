package com.hybridflow.workspace.service.impl;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
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
        if (!workflows.runnable(workspaceId, workflowId)) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Module hoặc workflow đang tắt.");
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
