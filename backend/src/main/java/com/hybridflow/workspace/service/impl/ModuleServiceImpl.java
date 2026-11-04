package com.hybridflow.workspace.service.impl;

import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.dto.request.SaveModuleRequest;
import com.hybridflow.workspace.dto.response.ModuleResponse;
import com.hybridflow.workspace.repository.ModuleRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.ModuleService;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ModuleServiceImpl implements ModuleService {
    private final ModuleRepository modules;
    private final WorkspaceAccessService access;
    private final CurrentUserService currentUser;
    private final AuditService audit;

    @Override
    @Transactional
    public ModuleResponse create(UUID workspaceId, SaveModuleRequest request) {
        access.requireManager(workspaceId);
        UUID moduleId = UUID.randomUUID();
        String description = request.getDescription() == null ? "" : request.getDescription().trim();
        modules.insert(moduleId, workspaceId, request.getName().trim(), description, request.isEnabled());
        audit.append(workspaceId, currentUser.requireUserId(), "MODULE_CREATED", moduleId.toString());
        return modules.find(workspaceId, moduleId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Override
    @Transactional
    public ModuleResponse update(UUID workspaceId, UUID moduleId, SaveModuleRequest request) {
        access.requireManager(workspaceId);
        int changed = modules.update(workspaceId, moduleId, request);
        if (changed == 0) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        audit.append(workspaceId, currentUser.requireUserId(), "MODULE_UPDATED", moduleId.toString());
        return modules.find(workspaceId, moduleId)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ModuleResponse> list(UUID workspaceId) {
        access.requireMember(workspaceId);
        return modules.list(workspaceId);
    }
}
