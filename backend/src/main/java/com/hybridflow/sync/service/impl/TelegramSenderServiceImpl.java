package com.hybridflow.sync.service.impl;

import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.service.NotificationSender;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TelegramSenderServiceImpl implements NotificationSender {
    private final TelegramNotificationService telegramService;

    @Override
    public String channel() { return "TELEGRAM"; }

    @Override
    public TelegramDeliveryResult send(String destination, String message) {
        return telegramService.sendDetailedMessage(message, destination);
    }
}
