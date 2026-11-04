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
import com.hybridflow.workspace.support.PendingGoogleConnection;
import com.hybridflow.workspace.support.PendingGoogleConnectionStore;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
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

    private String resolveGoogleAccessToken(UUID workspaceId, String connectionId) {
        WorkspaceRole role = access.requireMember(workspaceId);
        if (role == WorkspaceRole.EDITOR && !catalog.hasEditorGrant(workspaceId, connectionId)) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED, "Chưa được cấp quyền sử dụng connection này.");
        }
        Optional<String> state = catalog.findState(workspaceId, connectionId);
        if (state.isEmpty() || !"ACTIVE".equals(state.get())) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Connection không tồn tại hoặc đã bị thu hồi.");
        }
        Optional<String> googleConnId = catalog.findGoogleConnectionId(workspaceId, connectionId);
        if (googleConnId.isEmpty()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy thông tin xác thực Google.");
        }
        return credentials.resolveAccessToken(googleConnId.get());
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
        WorkspaceRole role = access.requireMember(workspaceId);
        if (role == WorkspaceRole.EDITOR && !catalog.hasEditorGrant(workspaceId, connectionId)) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED, "Chưa được cấp quyền sử dụng connection này.");
        }
        Optional<String> encrypted = catalog.findEncryptedTelegramToken(workspaceId, connectionId);
        if (encrypted.isEmpty()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Connection không tồn tại hoặc không phải Telegram.");
        }
        String token = cipher.decrypt(encrypted.get());
        JsonNode me = telegramClient.callWithToken(token, "getMe", null);
        String username = me.path("username").asText("");
        String firstName = me.path("first_name").asText("");
        return Map.of(
                "configured", true,
                "botUsername", username,
                "firstName", firstName,
                "connectionId", connectionId
        );
    }
}
