package com.hybridflow.workspace.service;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.service.impl.WorkspaceAccessServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspaceAccessServiceTest {
    @Mock
    private CurrentUserService currentUser;
    @Mock
    private MembershipRepository members;

    private WorkspaceAccessService access;
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        access = new WorkspaceAccessServiceImpl(currentUser, members);
        when(currentUser.requireUserId()).thenReturn(userId);
    }

    @Test
    void requireMemberReturnsRoleWhenPresent() {
        when(members.findRole(workspaceId, userId)).thenReturn(Optional.of(WorkspaceRole.EDITOR));
        WorkspaceRole role = access.requireMember(workspaceId);
        assertEquals(WorkspaceRole.EDITOR, role);
    }

    @Test
    void requireMemberThrowsAccessDeniedWhenNotMember() {
        when(members.findRole(workspaceId, userId)).thenReturn(Optional.empty());
        ApplicationException ex = assertThrows(ApplicationException.class, () -> access.requireMember(workspaceId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void requireManagerAllowsOwnerAndAdmin() {
        when(members.findRole(workspaceId, userId)).thenReturn(Optional.of(WorkspaceRole.OWNER));
        assertDoesNotThrow(() -> access.requireManager(workspaceId));

        when(members.findRole(workspaceId, userId)).thenReturn(Optional.of(WorkspaceRole.ADMIN));
        assertDoesNotThrow(() -> access.requireManager(workspaceId));
    }

    @Test
    void requireManagerRejectsEditorAndViewer() {
        when(members.findRole(workspaceId, userId)).thenReturn(Optional.of(WorkspaceRole.EDITOR));
        ApplicationException ex1 = assertThrows(ApplicationException.class, () -> access.requireManager(workspaceId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex1.getErrorCode());

        when(members.findRole(workspaceId, userId)).thenReturn(Optional.of(WorkspaceRole.VIEWER));
        ApplicationException ex2 = assertThrows(ApplicationException.class, () -> access.requireManager(workspaceId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex2.getErrorCode());
    }

    @Test
    void requireOwnerAllowsOnlyOwner() {
        when(members.findRole(workspaceId, userId)).thenReturn(Optional.of(WorkspaceRole.OWNER));
        assertDoesNotThrow(() -> access.requireOwner(workspaceId));

        when(members.findRole(workspaceId, userId)).thenReturn(Optional.of(WorkspaceRole.ADMIN));
        ApplicationException ex = assertThrows(ApplicationException.class, () -> access.requireOwner(workspaceId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }
}
