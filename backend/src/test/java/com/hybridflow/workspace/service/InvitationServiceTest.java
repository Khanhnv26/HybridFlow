package com.hybridflow.workspace.service;

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
import com.hybridflow.workspace.service.impl.InvitationServiceImpl;
import com.hybridflow.workspace.util.InvitationTokens;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InvitationServiceTest {
    @Mock
    private InvitationRepository invitations;
    @Mock
    private MembershipRepository members;
    @Mock
    private WorkspaceRepository workspaces;
    @Mock
    private WorkspaceAccessService access;
    @Mock
    private CurrentUserService currentUser;
    @Mock
    private AuditService audit;

    private final Clock clock = Clock.fixed(Instant.parse("2026-11-04T10:00:00Z"), ZoneOffset.UTC);
    private InvitationService service;

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID recipientId = UUID.randomUUID();
    private final UUID invitationId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        service = new InvitationServiceImpl(invitations, members, workspaces, access, currentUser, audit, clock, "http://localhost:3000");
    }

    @Test
    void createOwnerGeneratesInvitationUrlAndAudits() {
        when(currentUser.requireUserId()).thenReturn(ownerId);
        InviteMemberRequest request = new InviteMemberRequest();
        request.setEmail("collaborator@example.com");
        request.setRole(WorkspaceRole.EDITOR);

        InvitationResponse response = service.create(workspaceId, request);

        assertNotNull(response);
        assertNotNull(response.getId());
        assertTrue(response.getInvitationUrl().startsWith("http://localhost:3000/#invite="));
        assertEquals(clock.instant().plusSeconds(48 * 3600), response.getExpiresAt());

        verify(access).requireOwner(workspaceId);
        verify(invitations).insert(eq(response.getId()), eq(workspaceId), eq("collaborator@example.com"),
                eq(WorkspaceRole.EDITOR), any(), eq(response.getExpiresAt()), eq(ownerId));
        verify(audit).append(workspaceId, ownerId, "MEMBER_INVITED", response.getId().toString());
    }

    @Test
    void createThrowsWhenCallerNotOwner() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireOwner(workspaceId);
        InviteMemberRequest request = new InviteMemberRequest();
        request.setEmail("collaborator@example.com");
        request.setRole(WorkspaceRole.EDITOR);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.create(workspaceId, request));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void createThrowsValidationWhenInvitingOwnerRole() {
        InviteMemberRequest request = new InviteMemberRequest();
        request.setEmail("anotherowner@example.com");
        request.setRole(WorkspaceRole.OWNER);

        assertThrows(ValidationException.class, () -> service.create(workspaceId, request));
    }

    @Test
    void acceptMatchingEmailAddsMemberAndMarksAccepted() {
        String rawToken = InvitationTokens.create();
        String tokenHash = InvitationTokens.hash(rawToken);

        MeResponse user = new MeResponse(recipientId, "collaborator@example.com", "Collaborator");
        when(currentUser.requireUser()).thenReturn(user);

        InvitationRow row = new InvitationRow(invitationId, workspaceId, "collaborator@example.com",
                WorkspaceRole.EDITOR, clock.instant().plusSeconds(3600), "PENDING");
        when(invitations.lockByHash(tokenHash)).thenReturn(Optional.of(row));

        WorkspaceResponse workspaceResponse = new WorkspaceResponse(workspaceId, "Shop A", WorkspaceRole.EDITOR);
        when(workspaces.findForUser(recipientId)).thenReturn(List.of(workspaceResponse));

        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken(rawToken);

        WorkspaceResponse result = service.accept(request);

        assertEquals(workspaceResponse, result);
        verify(members).insertIfAbsent(workspaceId, recipientId, WorkspaceRole.EDITOR);
        verify(invitations).markAccepted(invitationId, recipientId);
        verify(audit).append(workspaceId, recipientId, "INVITATION_ACCEPTED", invitationId.toString());
    }

    @Test
    void acceptThrowsNotFoundWhenTokenDoesNotExist() {
        String rawToken = InvitationTokens.create();
        when(currentUser.requireUser()).thenReturn(new MeResponse(recipientId, "user@test.com", "User"));
        when(invitations.lockByHash(any())).thenReturn(Optional.empty());

        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken(rawToken);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.accept(request));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }

    @Test
    void acceptThrowsConflictWhenInvitationNotPending() {
        String rawToken = InvitationTokens.create();
        when(currentUser.requireUser()).thenReturn(new MeResponse(recipientId, "collaborator@example.com", "User"));

        InvitationRow row = new InvitationRow(invitationId, workspaceId, "collaborator@example.com",
                WorkspaceRole.EDITOR, clock.instant().plusSeconds(3600), "ACCEPTED");
        when(invitations.lockByHash(any())).thenReturn(Optional.of(row));

        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken(rawToken);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.accept(request));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void acceptThrowsConflictWhenInvitationExpired() {
        String rawToken = InvitationTokens.create();
        when(currentUser.requireUser()).thenReturn(new MeResponse(recipientId, "collaborator@example.com", "User"));

        InvitationRow row = new InvitationRow(invitationId, workspaceId, "collaborator@example.com",
                WorkspaceRole.EDITOR, clock.instant().minusSeconds(10), "PENDING");
        when(invitations.lockByHash(any())).thenReturn(Optional.of(row));

        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken(rawToken);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.accept(request));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void acceptThrowsAccessDeniedWhenUserEmailMismatch() {
        String rawToken = InvitationTokens.create();
        when(currentUser.requireUser()).thenReturn(new MeResponse(recipientId, "different@example.com", "Other"));

        InvitationRow row = new InvitationRow(invitationId, workspaceId, "collaborator@example.com",
                WorkspaceRole.EDITOR, clock.instant().plusSeconds(3600), "PENDING");
        when(invitations.lockByHash(any())).thenReturn(Optional.of(row));

        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken(rawToken);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.accept(request));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void revokeOwnerRevokesPendingInvitation() {
        when(currentUser.requireUserId()).thenReturn(ownerId);
        when(invitations.revoke(workspaceId, invitationId)).thenReturn(1);

        service.revoke(workspaceId, invitationId);

        verify(access).requireOwner(workspaceId);
        verify(audit).append(workspaceId, ownerId, "INVITATION_REVOKED", invitationId.toString());
    }

    @Test
    void revokeThrowsWhenCallerNotOwner() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireOwner(workspaceId);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.revoke(workspaceId, invitationId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void revokeThrowsNotFoundWhenNotPendingOrNotFound() {
        when(invitations.revoke(workspaceId, invitationId)).thenReturn(0);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.revoke(workspaceId, invitationId));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }
}
