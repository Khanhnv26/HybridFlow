package com.hybridflow.workspace.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connection.dto.GoogleOAuthCallbackResponse;
import com.hybridflow.connection.view.GoogleOAuthCallbackRenderer;
import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.util.ErrorClassifier;
import com.hybridflow.notification.service.TelegramSetupService;
import com.hybridflow.notification.dto.response.TelegramBotInfoResponse;
import com.hybridflow.notification.dto.response.TelegramLinkResponse;
import com.hybridflow.notification.dto.response.TelegramRecipientResponse;
import com.hybridflow.notification.dto.response.TelegramTestResponse;
import org.springframework.beans.factory.annotation.Value;
import com.hybridflow.connection.support.GoogleTokenCipher;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.client.TelegramApiClient;
import com.hybridflow.workspace.dto.request.CreateTelegramConnectionRequest;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.AuditService;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import com.hybridflow.workspace.service.WorkspaceConnectionService;
import com.hybridflow.workspace.service.GoogleConnectionRegistrationService;
import com.hybridflow.workspace.support.PendingGoogleConnection;
import com.hybridflow.workspace.support.PendingGoogleConnectionStore;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
    private final GoogleSheetsService googleSheetsService;
    private final TelegramSetupService telegramSetup;
    private final GoogleOAuthCallbackRenderer callbackRenderer;
    private final GoogleConnectionRegistrationService googleRegistration;

    @Value("${google.oauth.workspace-redirect-uri:http://localhost:8080/api/v1/workspaces/connections/google/callback}")
    private String workspaceRedirectUri = "http://localhost:8080/api/v1/workspaces/connections/google/callback";
    @Value("${app.frontend-origin:http://localhost:3000}")
    private String frontendOrigin = "http://localhost:3000";

    @Override
    public String startGoogleOAuth(UUID workspaceId, String connectionName, HttpSession session) {
        access.requireManager(workspaceId);
        String state = UUID.randomUUID().toString();
        pendingStore.save(session, new PendingGoogleConnection(
                workspaceId, currentUser.requireUserId(), state, connectionName, Instant.now()));
        return oauth.buildAuthorizationUrl(state, workspaceRedirectUri);
    }

    @Override
    public WorkspaceConnectionResponse completeGoogleOAuth(String code, String callbackState, HttpSession session) {
        PendingGoogleConnection pending = pendingStore.consume(session, callbackState);
        if (!pending.getUserId().equals(currentUser.requireUserId())) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
        access.requireManager(pending.getWorkspaceId());
        GoogleTokenResponse token = oauth.exChangeCode(code, workspaceRedirectUri);
        return googleRegistration.register(pending.getWorkspaceId(), currentUser.requireUserId(), pending.getName(), token);
    }

    @Override
    public String googleCallbackOrigin() {
        URI callback = URI.create(workspaceRedirectUri);
        return callback.getScheme() + "://" + callback.getAuthority();
    }

    @Override
    public GoogleOAuthCallbackResponse completeGoogleOAuthPage(String code, String state, String error, HttpSession session) {
        try {
            if (error != null) {
                pendingStore.consume(session, state);
                throw new ApplicationException(ErrorCode.OAUTH_CANCELLED);
            }
            if (code == null || code.isBlank()) throw new ValidationException("Thiếu mã kết nối Google.");
            WorkspaceConnectionResponse connection = completeGoogleOAuth(code, state, session);
            return new GoogleOAuthCallbackResponse(200, callbackRenderer.renderWorkspace(connection.getId(), null, frontendOrigin));
        } catch (RuntimeException exception) {
            ErrorDetails details = ErrorClassifier.classify(exception);
            return new GoogleOAuthCallbackResponse(details.getCode().getStatus(), callbackRenderer.renderWorkspace(null, details, frontendOrigin));
        }
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

    private String resolveGoogleAccessToken(UUID workspaceId, String connectionId) {
        requireConnectionUse(workspaceId, connectionId);
        Optional<String> googleConnId = catalog.findGoogleConnectionId(workspaceId, connectionId);
        if (googleConnId.isEmpty()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy thông tin xác thực Google.");
        }
        return credentials.resolveAccessToken(googleConnId.get());
    }

    private void requireConnectionUse(UUID workspaceId, String connectionId) {
        WorkspaceRole role = access.requireMember(workspaceId);
        if (role == WorkspaceRole.VIEWER) throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        if (role == WorkspaceRole.EDITOR && !catalog.hasEditorGrant(workspaceId, connectionId)) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED, "Chưa được cấp quyền sử dụng connection này.");
        }
        Optional<String> state = catalog.findState(workspaceId, connectionId);
        if (state.isEmpty() || !"ACTIVE".equals(state.get())) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Connection không tồn tại hoặc đã bị thu hồi.");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public SpreadsheetMetadataResponse getSheetMetadata(UUID workspaceId, String connectionId, String spreadsheetId) {
        String token = resolveGoogleAccessToken(workspaceId, connectionId);
        ReadSheetRequest request = ReadSheetRequest.builder()
                .accessToken(token)
                .spreadsheetId(spreadsheetId)
                .build();
        return googleSheetsService.getMetadata(request);
    }

    @Override
    @Transactional(readOnly = true)
    public SheetDataResponse readSheet(UUID workspaceId, String connectionId, ReadSheetRequest request) {
        String token = resolveGoogleAccessToken(workspaceId, connectionId);
        request.setAccessToken(token);
        return googleSheetsService.readSheet(request);
    }

    @Override
    @Transactional
    public UpdateCellResponse updateCell(UUID workspaceId, String connectionId, UpdateCellRequest request) {
        String token = resolveGoogleAccessToken(workspaceId, connectionId);
        request.setAccessToken(token);
        return googleSheetsService.updateCell(request);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getTelegramInfo(UUID workspaceId, String connectionId) {
        TelegramBotInfoResponse bot = telegramSetup.botInfo(resolveTelegramToken(workspaceId, connectionId));
        return Map.of("configured", bot.isConfigured(), "botUsername", bot.getUsername(),
                "firstName", bot.getDisplayName(), "canJoinGroups", bot.isCanJoinGroups(), "message", bot.getMessage());
    }

    private String resolveTelegramToken(UUID workspaceId, String connectionId) {
        requireConnectionUse(workspaceId, connectionId);
        Optional<String> encrypted = catalog.findEncryptedTelegramToken(workspaceId, connectionId);
        if (encrypted.isEmpty()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Connection không tồn tại hoặc không phải Telegram.");
        }
        return cipher.decrypt(encrypted.get());
    }

    private String telegramScope(UUID workspaceId, String connectionId) {
        return workspaceId + ":" + connectionId + ":" + currentUser.requireUserId();
    }

    @Override
    public TelegramLinkResponse startTelegramLink(UUID workspaceId, String connectionId, String recipientType) {
        String token = resolveTelegramToken(workspaceId, connectionId);
        return telegramSetup.startLink(telegramScope(workspaceId, connectionId), token, recipientType);
    }

    @Override
    public TelegramLinkResponse pollTelegramLink(UUID workspaceId, String connectionId, String linkId) {
        String token = resolveTelegramToken(workspaceId, connectionId);
        return telegramSetup.poll(telegramScope(workspaceId, connectionId), token, linkId);
    }

    @Override
    public TelegramRecipientResponse checkTelegramRecipient(UUID workspaceId, String connectionId, String chatId, String recipientType) {
        return telegramSetup.checkRecipient(resolveTelegramToken(workspaceId, connectionId), chatId, recipientType);
    }

    @Override
    public TelegramTestResponse sendTelegramTest(UUID workspaceId, String connectionId, String chatId, String recipientType) {
        return telegramSetup.sendTest(resolveTelegramToken(workspaceId, connectionId), chatId, recipientType);
    }
}
