package com.hybridflow.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import com.hybridflow.workspace.service.impl.WorkspaceConnectionServiceImpl;
import com.hybridflow.workspace.support.PendingGoogleConnection;
import com.hybridflow.workspace.support.PendingGoogleConnectionStore;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspaceConnectionServiceTest {
    @Mock
    private WorkspaceConnectionRepository catalog;
    @Mock
    private WorkspaceAccessService access;
    @Mock
    private CurrentUserService currentUser;
    @Mock
    private AuditService audit;
    @Mock
    private GoogleOAuthService oauth;
    @Mock
    private GoogleCredentialService credentials;
    @Mock
    private PendingGoogleConnectionStore pendingStore;
    @Mock
    private TelegramApiClient telegramClient;
    @Mock
    private GoogleTokenCipher cipher;
    @Mock
    private HttpSession session;

    private WorkspaceConnectionService service;

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        service = new WorkspaceConnectionServiceImpl(
                catalog, access, currentUser, audit, oauth, credentials,
                pendingStore, telegramClient, cipher);
    }

    @Test
    void startGoogleOAuthSavesPendingAndReturnsUrl() {
        when(currentUser.requireUserId()).thenReturn(userId);
        when(oauth.buildAuthorizationUrl(any())).thenReturn("https://accounts.google.com/o/oauth2/v2/auth?state=123");

        String url = service.startGoogleOAuth(workspaceId, "My Sheets", session);

        assertEquals("https://accounts.google.com/o/oauth2/v2/auth?state=123", url);
        verify(access).requireManager(workspaceId);
        verify(pendingStore).save(eq(session), any());
    }

    @Test
    void completeGoogleOAuthRejectsMismatchedUser() {
        UUID otherUser = UUID.randomUUID();
        PendingGoogleConnection pending = new PendingGoogleConnection(
                workspaceId, otherUser, "state-1", "My Sheets", Instant.now());
        when(pendingStore.consume(session, "state-1")).thenReturn(pending);
        when(currentUser.requireUserId()).thenReturn(userId);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.completeGoogleOAuth("code-1", "state-1", session));
        assertEquals(ErrorCode.ACCESS_DENIED, ex.getErrorCode());
    }

    @Test
    void completeGoogleOAuthStoresCredentialsAndCatalogEntry() {
        PendingGoogleConnection pending = new PendingGoogleConnection(
                workspaceId, userId, "state-1", "My Sheets", Instant.now());
        when(pendingStore.consume(session, "state-1")).thenReturn(pending);
        when(currentUser.requireUserId()).thenReturn(userId);
        GoogleTokenResponse tokenResponse = new GoogleTokenResponse();
        when(oauth.exChangeCode("code-1")).thenReturn(tokenResponse);
        when(credentials.store(tokenResponse)).thenReturn("gconn-123");

        WorkspaceConnectionResponse response = service.completeGoogleOAuth("code-1", "state-1", session);

        assertNotNull(response);
        assertEquals("gconn-123", response.getId());
        assertEquals("My Sheets", response.getName());
        assertEquals("GOOGLE", response.getProvider());
        verify(catalog).insertCatalog("gconn-123", workspaceId, "GOOGLE", "My Sheets", "ACTIVE");
        verify(audit).append(workspaceId, userId, "CONNECTION_CREATED", "gconn-123");
    }

    @Test
    void createTelegramValidatesTokenAndEncrypts() throws Exception {
        when(currentUser.requireUserId()).thenReturn(userId);
        when(telegramClient.callWithToken("bot-token-123", "getMe", null))
                .thenReturn(mapper.readTree("{\"username\":\"test_bot\"}"));
        when(cipher.encrypt("bot-token-123")).thenReturn("encrypted-token");

        CreateTelegramConnectionRequest request = new CreateTelegramConnectionRequest();
        request.setName("Alerts Bot");
        request.setBotToken("bot-token-123");

        WorkspaceConnectionResponse response = service.createTelegram(workspaceId, request);

        assertNotNull(response);
        assertEquals("Alerts Bot", response.getName());
        assertEquals("TELEGRAM", response.getProvider());
        verify(catalog).insertCatalog(any(), eq(workspaceId), eq("TELEGRAM"), eq("Alerts Bot"), eq("ACTIVE"));
        verify(catalog).insertTelegram(any(), eq("encrypted-token"), eq("test_bot"));
    }

    @Test
    void listReturnsConnectionsForMember() {
        WorkspaceConnectionResponse item = new WorkspaceConnectionResponse(
                "c1", "Sheets", "GOOGLE", "ACTIVE", 2);
        when(catalog.listConnections(workspaceId)).thenReturn(List.of(item));

        List<WorkspaceConnectionResponse> list = service.list(workspaceId);

        assertEquals(1, list.size());
        verify(access).requireMember(workspaceId);
    }

    @Test
    void grantRoleOnlyAllowsEditor() {
        when(currentUser.requireUserId()).thenReturn(userId);

        service.grantRole(workspaceId, "c1", "EDITOR");
        verify(access).requireOwner(workspaceId);
        verify(catalog).grantEditorRole(workspaceId, "c1");

        assertThrows(ValidationException.class,
                () -> service.grantRole(workspaceId, "c1", "ADMIN"));
    }

    @Test
    void deleteRejectsWhenInUse() {
        when(catalog.hasBinding(workspaceId, "c1")).thenReturn(true);

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.delete(workspaceId, "c1"));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void deleteSucceedsWhenUnused() {
        when(currentUser.requireUserId()).thenReturn(userId);
        when(catalog.hasBinding(workspaceId, "c1")).thenReturn(false);
        when(catalog.delete(workspaceId, "c1")).thenReturn(1);

        service.delete(workspaceId, "c1");
        verify(catalog).delete(workspaceId, "c1");
        verify(audit).append(workspaceId, userId, "CONNECTION_DELETED", "c1");
    }
}
