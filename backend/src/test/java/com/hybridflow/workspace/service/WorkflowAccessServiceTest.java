package com.hybridflow.workspace.service;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.service.impl.WorkflowAccessServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkflowAccessServiceTest {
    @Mock
    private WorkspaceAccessService workspaces;
    @Mock
    private TenantWorkflowRepository workflows;
    @Mock
    private CurrentUserService currentUser;

    private WorkflowAccessService service;

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final String workflowId = "wf-1";
    private final String contextId = "ctx-1";

    @BeforeEach
    void setup() {
        service = new WorkflowAccessServiceImpl(workspaces, workflows, currentUser);
    }

    @Test
    void requireThrowsNotFoundWhenWorkflowDoesNotExist() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.OWNER);
        when(workflows.exists(workspaceId, workflowId)).thenReturn(false);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.requireRead(workspaceId, workflowId));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }

    @Test
    void managerCanReadEditAndOperateWithoutExplicitGrant() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.OWNER);
        when(workflows.exists(workspaceId, workflowId)).thenReturn(true);

        service.requireRead(workspaceId, workflowId);
        service.requireEdit(workspaceId, workflowId);
        service.requireOperate(workspaceId, workflowId);
    }

    @Test
    void viewerCannotEditOrOperate() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.VIEWER);
        when(workflows.exists(workspaceId, workflowId)).thenReturn(true);

        ApplicationException editEx = assertThrows(ApplicationException.class,
                () -> service.requireEdit(workspaceId, workflowId));
        assertEquals(ErrorCode.ACCESS_DENIED, editEx.getErrorCode());

        ApplicationException runEx = assertThrows(ApplicationException.class,
                () -> service.requireOperate(workspaceId, workflowId));
        assertEquals(ErrorCode.ACCESS_DENIED, runEx.getErrorCode());
    }

    @Test
    void editorRequiresDirectGrantForEditAndRun() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.EDITOR);
        when(workflows.exists(workspaceId, workflowId)).thenReturn(true);
        when(currentUser.requireUserId()).thenReturn(userId);
        when(workflows.granted(workspaceId, workflowId, userId, "EDIT")).thenReturn(false);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.requireEdit(workspaceId, workflowId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());

        when(workflows.granted(workspaceId, workflowId, userId, "EDIT")).thenReturn(true);
        service.requireEdit(workspaceId, workflowId);
        verify(workflows, times(2)).granted(workspaceId, workflowId, userId, "EDIT");
    }

    @Test
    void requireRunThrowsConflictWhenNotRunnable() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.ADMIN);
        when(workflows.exists(workspaceId, workflowId)).thenReturn(true);
        when(workflows.runnable(workspaceId, workflowId)).thenReturn(false);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.requireRun(workspaceId, workflowId));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void requireContextThrowsNotFoundWhenContextDoesNotBelong() {
        when(workspaces.requireMember(workspaceId)).thenReturn(WorkspaceRole.ADMIN);
        when(workflows.exists(workspaceId, workflowId)).thenReturn(true);
        when(workflows.contextBelongs(workspaceId, workflowId, contextId)).thenReturn(false);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.requireContext(workspaceId, workflowId, contextId));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }
}
