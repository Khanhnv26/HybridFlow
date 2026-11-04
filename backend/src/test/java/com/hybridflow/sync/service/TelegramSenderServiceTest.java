package com.hybridflow.sync.service;

import com.hybridflow.connection.support.GoogleTokenCipher;
import com.hybridflow.notification.client.TelegramApiClient;
import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.service.impl.TelegramSenderServiceImpl;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class TelegramSenderServiceTest {
    private final TelegramNotificationService legacy = mock(TelegramNotificationService.class);
    private final WorkspaceConnectionRepository connections = mock(WorkspaceConnectionRepository.class);
    private final GoogleTokenCipher cipher = mock(GoogleTokenCipher.class);
    private final TelegramApiClient client = mock(TelegramApiClient.class);
    private final TelegramSenderServiceImpl sender = new TelegramSenderServiceImpl(legacy, connections, cipher, client);

    @Test void missingWorkspaceBotNeverUsesGlobalBot() {
        TelegramDeliveryResult result = sender.send(NotificationOutboxItem.builder()
                .workspaceId(UUID.randomUUID()).destination("123").message("test").build());
        assertFalse(result.isSuccess());
        assertFalse(result.isRetryable());
        assertEquals("CONNECTION_REQUIRED", result.getErrorCode());
        verifyNoInteractions(legacy, connections, cipher, client);
    }

    @Test void revokedWorkspaceBotNeverUsesGlobalBot() {
        UUID workspace = UUID.randomUUID();
        when(connections.findEncryptedTelegramToken(workspace, "revoked")).thenReturn(Optional.empty());
        TelegramDeliveryResult result = sender.send(NotificationOutboxItem.builder()
                .workspaceId(workspace).connectionId("revoked").destination("123").message("test").build());
        assertFalse(result.isSuccess());
        assertFalse(result.isRetryable());
        assertEquals("CONNECTION_REVOKED", result.getErrorCode());
        verifyNoInteractions(legacy, cipher, client);
    }
}
