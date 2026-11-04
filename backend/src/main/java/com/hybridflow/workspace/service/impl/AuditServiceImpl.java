package com.hybridflow.workspace.service.impl;

import com.hybridflow.common.util.ErrorContext;
import com.hybridflow.workspace.repository.AuditRepository;
import com.hybridflow.workspace.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuditServiceImpl implements AuditService {
    private final AuditRepository auditRepository;

    @Override
    public void append(UUID workspaceId, UUID actorUserId, String action, String resourceId) {
        auditRepository.insert(UUID.randomUUID(), workspaceId, actorUserId, action, resourceId, ErrorContext.currentId());
    }
}
