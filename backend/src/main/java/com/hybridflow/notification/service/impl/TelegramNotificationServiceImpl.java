package com.hybridflow.notification.service.impl;

import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.util.ErrorContext;
import com.hybridflow.common.util.ExternalErrors;
import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.entity.SyncConflict;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class TelegramNotificationServiceImpl implements TelegramNotificationService {

    @Value("${telegram.bot.token:}")
    private String botToken;

    @Value("${telegram.bot.chat-id:}")
    private String chatId;

    private final RestClient restClient = createRestClient();

    private static RestClient createRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(15000);
        return RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public boolean sendConflictAlert(SyncConflict conflict) {
        return sendConflictAlert(conflict, chatId);
    }

    @Override
    public boolean sendConflictAlert(SyncConflict conflict, String targetChatId) {

        String message = """
                HybridFlow: Có dữ liệu cần bạn xử lý
                Bản ghi: %s
                Trường dữ liệu: %s
                Giá trị ban đầu: %s
                Google Sheet: %s
                Kho lưu trữ: %s
                Mở HybridFlow để xem và chọn giá trị muốn giữ.
                """.formatted(
                conflict.getRecordId(),
                conflict.getColumnName(),
                conflict.getBaseValue(),
                conflict.getValueA(),
                conflict.getValueB()
        );

        return sendMessage(message, targetChatId);
    }

    @Override
    public boolean sendMessage(String message) {
        return sendMessage(message, chatId);
    }

    @Override
    public boolean sendMessage(String message, String targetChatId) {
        return sendDetailedMessage(message, targetChatId).isSuccess();
    }

    @Override
    public TelegramDeliveryResult sendDetailedMessage(String message, String targetChatId) {
        if (botToken == null || botToken.isBlank() || targetChatId == null || targetChatId.isBlank()) {
            return failure(new ApplicationException(ErrorCode.CONFIGURATION_ERROR));
        }
        String url = "https://api.telegram.org/bot" + botToken + "/sendMessage";

        try {
            Map<?, ?> response = restClient.post()
                    .uri(url)
                    .body(Map.of(
                            "chat_id", targetChatId,
                            "text", message
                    ))
                    .retrieve()
                    .body(Map.class);
            if (response == null) return failure(new ApplicationException(ErrorCode.UPSTREAM_FAILURE));
            if (Boolean.TRUE.equals(response.get("ok"))) return TelegramDeliveryResult.builder().success(true).build();
            int status = response.get("error_code") instanceof Number ? ((Number) response.get("error_code")).intValue() : 0;
            int retryAfter = 30;
            Object parameters = response.get("parameters");
            if (parameters instanceof Map && ((Map<?, ?>) parameters).get("retry_after") instanceof Number)
                retryAfter = Math.min(86400, Math.max(1, ((Number) ((Map<?, ?>) parameters).get("retry_after")).intValue()));
            return failure(ExternalErrors.telegram(status, false, retryAfter));
        } catch (RestClientResponseException e) {
            int code = e.getStatusCode().value();
            int retryAfter = 30;
            Matcher matcher = Pattern.compile("\"retry_after\"\\s*:\\s*(\\d+)").matcher(e.getResponseBodyAsString());
            if (matcher.find()) {
                try { retryAfter = Math.min(86400, Math.max(1, Integer.parseInt(matcher.group(1)))); }
                catch (NumberFormatException ignored) { /* Keep safe default backoff. */ }
            }
            return failure(ExternalErrors.telegram(code, e.getResponseBodyAsString().contains("chat not found"), retryAfter));
        } catch (Exception exception) {
            return failure(new ApplicationException(ErrorCode.UPSTREAM_UNAVAILABLE));
        }
    }

    private TelegramDeliveryResult failure(ApplicationException exception) {
        return TelegramDeliveryResult.builder().success(false).retryable(exception.getErrorCode().isRetryable())
                .retryAfterSeconds(exception.getRetryAfterSeconds()).error(exception.getMessage())
                .errorCode(exception.getErrorCode().name()).correlationId(ErrorContext.currentId()).build();
    }
}
