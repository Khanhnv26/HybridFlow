package com.hybridflow.workspace.service;

import java.util.UUID;

public interface AuditService {
    void append(UUID workspaceId, UUID actorUserId, String action, String resourceId);
}
