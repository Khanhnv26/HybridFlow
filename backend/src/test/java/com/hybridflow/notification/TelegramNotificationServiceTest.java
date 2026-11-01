package com.hybridflow.notification;

import com.hybridflow.notification.service.impl.TelegramNotificationServiceImpl;
import com.hybridflow.sync.entity.SyncConflict;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertTrue;

class TelegramNotificationServiceTest {

    @Test
    @DisplayName("Bắn tin nhắn cảnh báo xung đột thật về điện thoại")
    void testSendRealTelegramMessage() {
        TelegramNotificationServiceImpl service = new TelegramNotificationServiceImpl();
        ReflectionTestUtils.setField(service, "botToken", "9223690617:AAHonVwiPIsQz0CDhSTykcQjEpmeg09Mqo8");
        ReflectionTestUtils.setField(service, "chatId", "8706234310");

        SyncConflict dummyConflict = SyncConflict.builder()
                .recordId("ORD-999")
                .columnName("status")
                .baseValue("NEW")
                .valueA("SHIPPING")
                .valueB("CANCELLED")
                .build();

        boolean sent = service.sendConflictAlert(dummyConflict);
        assertTrue(sent, "Tin nhắn Telegram phải được gửi thành công!");
    }
}
