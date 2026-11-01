package com.hybridflow.notification.service.impl;

import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.entity.SyncConflict;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class TelegramNotificationServiceImpl implements TelegramNotificationService {

    @Value("${telegram.bot.token}")
    private String botToken;

    @Value("${telegram.bot.chat-id}")
    private String chatId;

    private final RestClient restClient = RestClient.create();

    @Override
    public boolean sendConflictAlert(SyncConflict conflict) {

        String message = """
                *[HYBRIDFLOW CẢNH BÁO XUNG ĐỘT]*
                • *Mã bản ghi:* `%s`
                • *Cột bị lệch:* `%s`
                • *Giá trị cũ (Base):* `%s`
                • *Sheet A sửa thành:* `%s`
                • *Sheet B sửa thành:* `%s`
                 _Vui lòng vào web xử lý xung đột!_
                """.formatted(
                conflict.getRecordId(),
                conflict.getColumnName(),
                conflict.getBaseValue(),
                conflict.getValueA(),
                conflict.getValueB()
        );

        return sendMessage(message);
    }

    @Override
    public boolean sendMessage(String message) {
        String url = "https://api.telegram.org/bot" + botToken + "/sendMessage";

        try {
            restClient.post()
                    .uri(url)
                    .body(Map.of(
                            "chat_id", chatId,
                            "text", message,
                            "parse_mode", "Markdown"
                    ))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            return false;
        }

        return true;
    }
}
