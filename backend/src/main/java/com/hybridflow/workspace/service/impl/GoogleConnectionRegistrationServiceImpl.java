package com.hybridflow.workspace.service.impl;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.GoogleConnectionRegistrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GoogleConnectionRegistrationServiceImpl implements GoogleConnectionRegistrationService {
    private final GoogleCredentialService credentials;
    private final WorkspaceConnectionRepository catalog;
    private final AuditService audit;

    @Override
    @Transactional
    public WorkspaceConnectionResponse register(UUID workspaceId, UUID userId, String name, GoogleTokenResponse token) {
        String id = credentials.storeInCurrentTransaction(token);
        catalog.insertCatalog(id, workspaceId, "GOOGLE", name, "ACTIVE");
        audit.append(workspaceId, userId, "CONNECTION_CREATED", id);
        return new WorkspaceConnectionResponse(id, name, "GOOGLE", "ACTIVE", 0);
    }
}
