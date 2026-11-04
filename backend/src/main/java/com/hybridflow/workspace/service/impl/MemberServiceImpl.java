package com.hybridflow.workspace.service.impl;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.dto.request.ChangeRoleRequest;
import com.hybridflow.workspace.dto.response.MemberResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.MemberService;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MemberServiceImpl implements MemberService {
    private final MembershipRepository members;
    private final WorkspaceAccessService access;
    private final CurrentUserService currentUser;
    private final AuditService audit;

    @Override
    @Transactional(readOnly = true)
    public List<MemberResponse> list(UUID workspaceId) {
        access.requireMember(workspaceId);
        return members.findMembers(workspaceId);
    }

    @Override
    @Transactional
    public void changeRole(UUID workspaceId, UUID targetUserId, ChangeRoleRequest request) {
        access.requireOwner(workspaceId);
        WorkspaceRole targetRole = members.findRoleForUpdate(workspaceId, targetUserId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
        if (targetRole == WorkspaceRole.OWNER || request.getRole() == WorkspaceRole.OWNER) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Không thể chuyển hoặc sửa quyền Owner.");
        }
        members.updateRole(workspaceId, targetUserId, request.getRole());
        audit.append(workspaceId, currentUser.requireUserId(), "MEMBER_ROLE_CHANGED", targetUserId.toString());
    }

    @Override
    @Transactional
    public void remove(UUID workspaceId, UUID targetUserId) {
        access.requireOwner(workspaceId);
        WorkspaceRole targetRole = members.findRoleForUpdate(workspaceId, targetUserId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
        if (targetRole == WorkspaceRole.OWNER) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Không thể xóa Owner khỏi workspace.");
        }
        members.delete(workspaceId, targetUserId);
        audit.append(workspaceId, currentUser.requireUserId(), "MEMBER_REMOVED", targetUserId.toString());
    }
}
