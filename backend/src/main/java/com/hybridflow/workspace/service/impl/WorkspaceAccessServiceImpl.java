package com.hybridflow.workspace.service.impl;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkspaceAccessServiceImpl implements WorkspaceAccessService {
    private final CurrentUserService currentUser;
    private final MembershipRepository members;

    @Override
    public WorkspaceRole requireMember(UUID workspaceId) {
        return members.findRole(workspaceId, currentUser.requireUserId())
                .orElseThrow(() -> new ApplicationException(ErrorCode.ACCESS_DENIED));
    }

    @Override
    public void requireManager(UUID workspaceId) {
        WorkspaceRole role = requireMember(workspaceId);
        if (role != WorkspaceRole.OWNER && role != WorkspaceRole.ADMIN) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
    }

    @Override
    public void requireOwner(UUID workspaceId) {
        if (requireMember(workspaceId) != WorkspaceRole.OWNER) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
    }
}
