package com.hybridflow.workspace.service;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.workspace.dto.request.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.repository.WorkspaceRepository;
import com.hybridflow.workspace.service.impl.WorkspaceServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceTest {
    @Mock
    private WorkspaceRepository workspaces;
    @Mock
    private MembershipRepository members;
    @Mock
    private CurrentUserService currentUser;
    @Mock
    private AuditService audit;

    private WorkspaceService service;
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        service = new WorkspaceServiceImpl(workspaces, members, currentUser, audit);
    }

    @Test
    void createInsertsWorkspaceAndOwnerMembershipAndAudit() {
        when(currentUser.requireUserId()).thenReturn(userId);
        CreateWorkspaceRequest request = new CreateWorkspaceRequest();
        request.setName("Shop A");

        WorkspaceResponse response = service.create(request);

        assertNotNull(response.getId());
        assertEquals("Shop A", response.getName());
        assertEquals(WorkspaceRole.OWNER, response.getRole());

        verify(workspaces).insert(eq(response.getId()), eq("Shop A"));
        verify(members).insert(eq(response.getId()), eq(userId), eq(WorkspaceRole.OWNER));
        verify(audit).append(eq(response.getId()), eq(userId), eq("WORKSPACE_CREATED"), eq(response.getId().toString()));
    }

    @Test
    void mineReturnsWorkspacesForCurrentUser() {
        when(currentUser.requireUserId()).thenReturn(userId);
        List<WorkspaceResponse> expected = List.of(new WorkspaceResponse(UUID.randomUUID(), "Shop A", WorkspaceRole.OWNER));
        when(workspaces.findForUser(userId)).thenReturn(expected);

        List<WorkspaceResponse> result = service.mine();

        assertEquals(expected, result);
    }
}
