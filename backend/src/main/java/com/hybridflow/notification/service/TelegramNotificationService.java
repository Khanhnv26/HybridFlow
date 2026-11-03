package com.hybridflow.notification.service;

import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.sync.entity.SyncConflict;

public interface TelegramNotificationService {
    boolean sendConflictAlert(SyncConflict conflict);
    boolean sendConflictAlert(SyncConflict conflict, String targetChatId);
    boolean sendMessage(String message);
    boolean sendMessage(String message, String targetChatId);
    TelegramDeliveryResult sendDetailedMessage(String message, String targetChatId);
}
