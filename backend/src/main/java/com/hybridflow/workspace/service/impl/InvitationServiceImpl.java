package com.hybridflow.workspace.service.impl;

import com.hybridflow.auth.dto.response.MeResponse;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.workspace.dto.request.AcceptInvitationRequest;
import com.hybridflow.workspace.dto.request.InviteMemberRequest;
import com.hybridflow.workspace.dto.response.InvitationResponse;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.model.InvitationRow;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.InvitationRepository;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.repository.WorkspaceRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.InvitationService;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import com.hybridflow.workspace.util.InvitationTokens;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class InvitationServiceImpl implements InvitationService {
    private final InvitationRepository invitations;
    private final MembershipRepository members;
    private final WorkspaceRepository workspaces;
    private final WorkspaceAccessService access;
    private final CurrentUserService currentUser;
    private final AuditService audit;
    private final Clock clock;
    private final String frontendOrigin;

    public InvitationServiceImpl(
            InvitationRepository invitations,
            MembershipRepository members,
            WorkspaceRepository workspaces,
            WorkspaceAccessService access,
            CurrentUserService currentUser,
            AuditService audit,
            Clock clock,
            @Value("${app.frontend-origin:http://localhost:3000}") String frontendOrigin) {
        this.invitations = invitations;
        this.members = members;
        this.workspaces = workspaces;
        this.access = access;
        this.currentUser = currentUser;
        this.audit = audit;
        this.clock = clock;
        this.frontendOrigin = frontendOrigin;
    }

    @Override
    @Transactional
    public InvitationResponse create(UUID workspaceId, InviteMemberRequest request) {
        access.requireOwner(workspaceId);
        if (request.getRole() == WorkspaceRole.OWNER) {
            throw new ValidationException("Không thể mời thêm Owner.");
        }
        String raw = InvitationTokens.create();
        UUID id = UUID.randomUUID();
        Instant expiresAt = clock.instant().plus(Duration.ofHours(48));
        invitations.insert(id, workspaceId, request.getEmail().trim().toLowerCase(Locale.ROOT),
                request.getRole(), InvitationTokens.hash(raw), expiresAt, currentUser.requireUserId());
        audit.append(workspaceId, currentUser.requireUserId(), "MEMBER_INVITED", id.toString());
        return new InvitationResponse(id, frontendOrigin + "/#invite=" + raw, expiresAt);
    }

    @Override
    @Transactional
    public WorkspaceResponse accept(AcceptInvitationRequest request) {
        MeResponse user = currentUser.requireUser();
        InvitationRow invitation = invitations.lockByHash(InvitationTokens.hash(request.getToken()))
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!"PENDING".equals(invitation.getState()) || !invitation.getExpiresAt().isAfter(clock.instant())) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Lời mời đã hết hạn hoặc đã được sử dụng.");
        }
        if (!invitation.getEmail().equalsIgnoreCase(user.getEmail())) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
        members.insertIfAbsent(invitation.getWorkspaceId(), user.getId(), invitation.getRole());
        invitations.markAccepted(invitation.getId(), user.getId());
        audit.append(invitation.getWorkspaceId(), user.getId(), "INVITATION_ACCEPTED", invitation.getId().toString());
        return workspaces.findForUser(user.getId()).stream()
                .filter(workspace -> workspace.getId().equals(invitation.getWorkspaceId()))
                .findFirst()
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Override
    @Transactional
    public void revoke(UUID workspaceId, UUID invitationId) {
        access.requireOwner(workspaceId);
        int changed = invitations.revoke(workspaceId, invitationId);
        if (changed == 0) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        audit.append(workspaceId, currentUser.requireUserId(), "INVITATION_REVOKED", invitationId.toString());
    }
}
