package com.hybridflow.workspace.service;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.dto.request.SaveModuleRequest;
import com.hybridflow.workspace.dto.response.ModuleResponse;
import com.hybridflow.workspace.repository.ModuleRepository;
import com.hybridflow.workspace.service.impl.ModuleServiceImpl;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ModuleServiceTest {
    @Mock
    private ModuleRepository modules;
    @Mock
    private WorkspaceAccessService access;
    @Mock
    private CurrentUserService currentUser;
    @Mock
    private AuditService audit;

    private ModuleService service;
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID moduleId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        service = new ModuleServiceImpl(modules, access, currentUser, audit);
    }

    @Test
    void createRequiresManagerAndInsertsAndAudits() {
        when(currentUser.requireUserId()).thenReturn(userId);
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("Warehouse");
        request.setDescription("Stock management");
        request.setEnabled(true);

        ModuleResponse response = new ModuleResponse(moduleId, workspaceId, "Warehouse", "Stock management", true, Instant.now());
        when(modules.find(eq(workspaceId), any())).thenReturn(Optional.of(response));

        ModuleResponse result = service.create(workspaceId, request);

        assertEquals(response, result);
        verify(access).requireManager(workspaceId);
        verify(audit).append(eq(workspaceId), eq(userId), eq("MODULE_CREATED"), any());
    }

    @Test
    void createThrowsWhenUserIsNotManager() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireManager(workspaceId);
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("Warehouse");

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.create(workspaceId, request));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void updateRequiresManagerAndAudits() {
        when(currentUser.requireUserId()).thenReturn(userId);
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("Warehouse Updated");
        request.setDescription("Updated desc");
        request.setEnabled(false);

        when(modules.update(workspaceId, moduleId, request)).thenReturn(1);
        ModuleResponse response = new ModuleResponse(moduleId, workspaceId, "Warehouse Updated", "Updated desc", false, Instant.now());
        when(modules.find(workspaceId, moduleId)).thenReturn(Optional.of(response));

        ModuleResponse result = service.update(workspaceId, moduleId, request);

        assertEquals(response, result);
        verify(access).requireManager(workspaceId);
        verify(audit).append(workspaceId, userId, "MODULE_UPDATED", moduleId.toString());
    }

    @Test
    void updateThrowsWhenUserIsNotManager() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireManager(workspaceId);
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("Warehouse Updated");

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.update(workspaceId, moduleId, request));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void updateThrowsWhenModuleNotFound() {
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("Warehouse Updated");
        when(modules.update(workspaceId, moduleId, request)).thenReturn(0);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.update(workspaceId, moduleId, request));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }

    @Test
    void listRequiresMemberAndReturnsModules() {
        List<ModuleResponse> expected = List.of(new ModuleResponse(moduleId, workspaceId, "Warehouse", "", true, Instant.now()));
        when(modules.list(workspaceId)).thenReturn(expected);

        List<ModuleResponse> result = service.list(workspaceId);

        assertEquals(expected, result);
        verify(access).requireMember(workspaceId);
    }

    @Test
    void listThrowsWhenUserIsNotMember() {
        doThrow(new ApplicationException(ErrorCode.ACCESS_DENIED)).when(access).requireMember(workspaceId);

        ApplicationException ex = assertThrows(ApplicationException.class, () -> service.list(workspaceId));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }
}
