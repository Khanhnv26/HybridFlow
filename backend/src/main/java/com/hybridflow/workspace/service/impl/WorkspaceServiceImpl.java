package com.hybridflow.workspace.service.impl;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.workspace.dto.request.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.repository.WorkspaceRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkspaceServiceImpl implements WorkspaceService {
    private final WorkspaceRepository workspaces;
    private final MembershipRepository members;
    private final CurrentUserService currentUser;
    private final AuditService audit;

    @Override
    @Transactional
    public WorkspaceResponse create(CreateWorkspaceRequest request) {
        UUID userId = currentUser.requireUserId();
        UUID id = UUID.randomUUID();
        String name = request.getName().trim();
        workspaces.insert(id, name);
        members.insert(id, userId, WorkspaceRole.OWNER);
        audit.append(id, userId, "WORKSPACE_CREATED", id.toString());
        return new WorkspaceResponse(id, name, WorkspaceRole.OWNER);
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkspaceResponse> mine() {
        return workspaces.findForUser(currentUser.requireUserId());
    }
}
