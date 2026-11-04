package com.hybridflow.sync.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.connection.support.GoogleTokenCipher;
import com.hybridflow.notification.client.TelegramApiClient;
import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.service.NotificationSender;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class TelegramSenderServiceImpl implements NotificationSender {
    private final TelegramNotificationService telegramService;
    private final WorkspaceConnectionRepository workspaceConnections;
    private final GoogleTokenCipher cipher;
    private final TelegramApiClient apiClient;

    @Override
    public String channel() {
        return "TELEGRAM";
    }

    @Override
    public TelegramDeliveryResult send(String destination, String message) {
        return telegramService.sendDetailedMessage(message, destination);
    }

    @Override
    public TelegramDeliveryResult send(NotificationOutboxItem item) {
        if (item.getWorkspaceId() != null && item.getConnectionId() == null) {
            return TelegramDeliveryResult.builder().success(false).retryable(false)
                    .errorCode(ErrorCode.CONNECTION_REQUIRED.name()).error("Thông báo thiếu kết nối Telegram của workspace.").build();
        }
        if (item.getWorkspaceId() != null && item.getConnectionId() != null) {
            Optional<String> encrypted = workspaceConnections.findEncryptedTelegramToken(
                    item.getWorkspaceId(), item.getConnectionId());
            if (encrypted.isEmpty()) {
                return TelegramDeliveryResult.builder()
                        .success(false)
                        .retryable(false)
                        .error("Connection đã bị thu hồi hoặc không hợp lệ.")
                        .errorCode("CONNECTION_REVOKED")
                        .build();
            }
            try {
                String token = cipher.decrypt(encrypted.get());
                JsonNode res = apiClient.callWithToken(token, "sendMessage",
                        Map.of("chat_id", item.getDestination(), "text", item.getMessage()));
                return TelegramDeliveryResult.builder()
                        .success(res != null && !res.isEmpty())
                        .build();
            } catch (ApplicationException exception) {
                return TelegramDeliveryResult.builder()
                        .success(false)
                        .retryable(exception.getErrorCode().isRetryable())
                        .error(exception.getMessage())
                        .errorCode(exception.getErrorCode().name())
                        .retryAfterSeconds(exception.getRetryAfterSeconds())
                        .build();
            }
        }
        return send(item.getDestination(), item.getMessage());
    }
}
