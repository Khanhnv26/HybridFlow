package com.hybridflow.notification.service.impl;

import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.entity.SyncConflict;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

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

    private boolean sendMessage(String message, String targetChatId) {
        if (botToken == null || botToken.isBlank() || targetChatId == null || targetChatId.isBlank()) return false;
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
            return response != null && Boolean.TRUE.equals(response.get("ok"));
        } catch (Exception e) {
            return false;
        }

    }
}
