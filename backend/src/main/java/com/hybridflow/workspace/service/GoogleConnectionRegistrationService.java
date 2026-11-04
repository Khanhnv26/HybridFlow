package com.hybridflow.workspace.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import java.util.UUID;

public interface GoogleConnectionRegistrationService {
    WorkspaceConnectionResponse register(UUID workspaceId, UUID userId, String name, GoogleTokenResponse token);
}
