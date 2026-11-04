package com.hybridflow.workspace.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connection.support.GoogleTokenCipher;
import com.hybridflow.notification.client.TelegramApiClient;
import com.hybridflow.workspace.dto.request.CreateTelegramConnectionRequest;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import com.hybridflow.workspace.service.WorkspaceConnectionService;
import com.hybridflow.workspace.support.PendingGoogleConnection;
import com.hybridflow.workspace.support.PendingGoogleConnectionStore;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkspaceConnectionServiceImpl implements WorkspaceConnectionService {
    private final WorkspaceConnectionRepository catalog;
    private final WorkspaceAccessService access;
    private final CurrentUserService currentUser;
    private final AuditService audit;
    private final GoogleOAuthService oauth;
    private final GoogleCredentialService credentials;
    private final PendingGoogleConnectionStore pendingStore;
    private final TelegramApiClient telegramClient;
    private final GoogleTokenCipher cipher;

    @Override
    public String startGoogleOAuth(UUID workspaceId, String connectionName, HttpSession session) {
        access.requireManager(workspaceId);
        String state = UUID.randomUUID().toString();
        pendingStore.save(session, new PendingGoogleConnection(
                workspaceId, currentUser.requireUserId(), state, connectionName, Instant.now()));
        return oauth.buildAuthorizationUrl(state);
    }

    @Override
    @Transactional
    public WorkspaceConnectionResponse completeGoogleOAuth(String code, String callbackState, HttpSession session) {
        PendingGoogleConnection pending = pendingStore.consume(session, callbackState);
        if (!pending.getUserId().equals(currentUser.requireUserId())) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
        access.requireManager(pending.getWorkspaceId());
        GoogleTokenResponse token = oauth.exChangeCode(code);
        String connectionId = credentials.store(token);
        catalog.insertCatalog(connectionId, pending.getWorkspaceId(), "GOOGLE", pending.getName(), "ACTIVE");
        audit.append(pending.getWorkspaceId(), currentUser.requireUserId(), "CONNECTION_CREATED", connectionId);
        return new WorkspaceConnectionResponse(connectionId, pending.getName(), "GOOGLE", "ACTIVE", 0);
    }

    @Override
    @Transactional
    public WorkspaceConnectionResponse createTelegram(UUID workspaceId, CreateTelegramConnectionRequest request) {
        access.requireManager(workspaceId);
        String token = request.getBotToken().trim();
        JsonNode me = telegramClient.callWithToken(token, "getMe", null);
        String botUsername = me.path("username").asText("");
        String connectionId = "tconn-" + UUID.randomUUID();
        String encrypted = cipher.encrypt(token);
        catalog.insertCatalog(connectionId, workspaceId, "TELEGRAM", request.getName().trim(), "ACTIVE");
        catalog.insertTelegram(connectionId, encrypted, botUsername);
        audit.append(workspaceId, currentUser.requireUserId(), "CONNECTION_CREATED", connectionId);
        return new WorkspaceConnectionResponse(connectionId, request.getName().trim(), "TELEGRAM", "ACTIVE", 0);
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkspaceConnectionResponse> list(UUID workspaceId) {
        access.requireMember(workspaceId);
        return catalog.listConnections(workspaceId);
    }

    @Override
    @Transactional
    public void grantRole(UUID workspaceId, String connectionId, String role) {
        access.requireOwner(workspaceId);
        if (!"EDITOR".equalsIgnoreCase(role)) {
            throw new ValidationException("Chỉ hỗ trợ cấp quyền role EDITOR.");
        }
        catalog.grantEditorRole(workspaceId, connectionId);
        audit.append(workspaceId, currentUser.requireUserId(), "CONNECTION_ROLE_GRANTED", connectionId);
    }

    @Override
    @Transactional
    public void revoke(UUID workspaceId, String connectionId) {
        access.requireManager(workspaceId);
        int changed = catalog.revoke(workspaceId, connectionId);
        if (changed == 0) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        audit.append(workspaceId, currentUser.requireUserId(), "CONNECTION_REVOKED", connectionId);
    }

    @Override
    @Transactional
    public void delete(UUID workspaceId, String connectionId) {
        access.requireManager(workspaceId);
        if (catalog.hasBinding(workspaceId, connectionId)) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Connection đang được sử dụng trong workflow.");
        }
        int changed = catalog.delete(workspaceId, connectionId);
        if (changed == 0) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        audit.append(workspaceId, currentUser.requireUserId(), "CONNECTION_DELETED", connectionId);
    }
}
