package com.hybridflow.workspace.service;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.dto.request.ChangeRoleRequest;
import com.hybridflow.workspace.dto.response.MemberResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.service.impl.MemberServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MemberServiceTest {
    @Mock
    private MembershipRepository members;
    @Mock
    private WorkspaceAccessService access;
    @Mock
    private CurrentUserService currentUser;
    @Mock
    private AuditService audit;

    private MemberService service;
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID callerId = UUID.randomUUID();
    private final UUID targetUserId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        service = new MemberServiceImpl(members, access, currentUser, audit);
    }

    @Test
    void listRequiresMemberAndReturnsMembers() {
        List<MemberResponse> expected = List.of(new MemberResponse(workspaceId, targetUserId, "user@test.com", "User", WorkspaceRole.ADMIN, Instant.now()));
        when(members.findMembers(workspaceId)).thenReturn(expected);

        List<MemberResponse> result = service.list(workspaceId);

        assertEquals(expected, result);
        verify(access).requireMember(workspaceId);
    }

    @Test
    void listThrowsWhenNotMember() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireMember(workspaceId);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.list(workspaceId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void changeRoleOwnerCanChangeRoleOfNonOwnerMember() {
        when(currentUser.requireUserId()).thenReturn(callerId);
        when(members.findRoleForUpdate(workspaceId, targetUserId)).thenReturn(Optional.of(WorkspaceRole.EDITOR));
        ChangeRoleRequest request = new ChangeRoleRequest();
        request.setRole(WorkspaceRole.ADMIN);

        service.changeRole(workspaceId, targetUserId, request);

        verify(access).requireOwner(workspaceId);
        verify(members).updateRole(workspaceId, targetUserId, WorkspaceRole.ADMIN);
        verify(audit).append(workspaceId, callerId, "MEMBER_ROLE_CHANGED", targetUserId.toString());
    }

    @Test
    void changeRoleThrowsWhenCallerNotOwner() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireOwner(workspaceId);
        ChangeRoleRequest request = new ChangeRoleRequest();
        request.setRole(WorkspaceRole.ADMIN);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.changeRole(workspaceId, targetUserId, request));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void changeRoleThrowsWhenTargetNotFound() {
        when(members.findRoleForUpdate(workspaceId, targetUserId)).thenReturn(Optional.empty());
        ChangeRoleRequest request = new ChangeRoleRequest();
        request.setRole(WorkspaceRole.ADMIN);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.changeRole(workspaceId, targetUserId, request));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }

    @Test
    void changeRoleThrowsConflictWhenTargetIsOwner() {
        when(members.findRoleForUpdate(workspaceId, targetUserId)).thenReturn(Optional.of(WorkspaceRole.OWNER));
        ChangeRoleRequest request = new ChangeRoleRequest();
        request.setRole(WorkspaceRole.ADMIN);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.changeRole(workspaceId, targetUserId, request));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void changeRoleThrowsConflictWhenPromotingToOwner() {
        when(members.findRoleForUpdate(workspaceId, targetUserId)).thenReturn(Optional.of(WorkspaceRole.EDITOR));
        ChangeRoleRequest request = new ChangeRoleRequest();
        request.setRole(WorkspaceRole.OWNER);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.changeRole(workspaceId, targetUserId, request));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void removeOwnerCanRemoveNonOwnerMember() {
        when(currentUser.requireUserId()).thenReturn(callerId);
        when(members.findRoleForUpdate(workspaceId, targetUserId)).thenReturn(Optional.of(WorkspaceRole.VIEWER));

        service.remove(workspaceId, targetUserId);

        verify(access).requireOwner(workspaceId);
        verify(members).delete(workspaceId, targetUserId);
        verify(audit).append(workspaceId, callerId, "MEMBER_REMOVED", targetUserId.toString());
    }

    @Test
    void removeThrowsWhenCallerNotOwner() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireOwner(workspaceId);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.remove(workspaceId, targetUserId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void removeThrowsConflictWhenTargetIsOwner() {
        when(members.findRoleForUpdate(workspaceId, targetUserId)).thenReturn(Optional.of(WorkspaceRole.OWNER));

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.remove(workspaceId, targetUserId));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }
}
