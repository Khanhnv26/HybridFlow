package com.hybridflow.sync.service;

import com.hybridflow.notification.dto.response.TelegramDeliveryResult;

public interface NotificationSender {
    String channel();
    TelegramDeliveryResult send(String destination, String message);
}
