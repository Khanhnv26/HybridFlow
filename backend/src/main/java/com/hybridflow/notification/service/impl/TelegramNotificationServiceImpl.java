package com.hybridflow.notification.service.impl;

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
            return TelegramDeliveryResult.builder()
                    .success(false)
                    .retryable(false)
                    .error("Bot token hoặc Chat ID chưa được cấu hình.")
                    .build();
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
            boolean ok = response != null && Boolean.TRUE.equals(response.get("ok"));
            return TelegramDeliveryResult.builder()
                    .success(ok)
                    .retryable(!ok)
                    .error(ok ? null : "Telegram API trả về kết quả không thành công.")
                    .build();
        } catch (RestClientResponseException e) {
            int code = e.getStatusCode().value();
            if (code == 429) {
                int retryAfter = 30;
                try {
                    String body = e.getResponseBodyAsString();
                    if (body != null && body.contains("retry_after")) {
                        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"retry_after\"\\s*:\\s*(\\d+)").matcher(body);
                        if (m.find()) retryAfter = Integer.parseInt(m.group(1));
                    }
                } catch (Exception ignored) {}
                return TelegramDeliveryResult.builder()
                        .success(false)
                        .retryable(true)
                        .retryAfterSeconds(retryAfter)
                        .error("Telegram giới hạn tần suất (429).")
                        .build();
            }
            boolean permanent = (code == 400 || code == 403);
            return TelegramDeliveryResult.builder()
                    .success(false)
                    .retryable(!permanent)
                    .error("Telegram trả lỗi HTTP " + code + ".")
                    .build();
        } catch (Exception e) {
            return TelegramDeliveryResult.builder()
                    .success(false)
                    .retryable(true)
                    .error("Không thể kết nối tới Telegram. Thông báo sẽ được thử lại.")
                    .build();
        }
    }
}
