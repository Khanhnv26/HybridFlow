package com.hybridflow.sync.service;

import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.sync.model.NotificationOutboxItem;

public interface NotificationSender {
    String channel();
    TelegramDeliveryResult send(String destination, String message);
    default TelegramDeliveryResult send(NotificationOutboxItem item) {
        return send(item.getDestination(), item.getMessage());
    }
}
