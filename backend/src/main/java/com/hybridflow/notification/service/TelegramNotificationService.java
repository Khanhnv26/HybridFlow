package com.hybridflow.notification.service;

import com.hybridflow.sync.entity.SyncConflict;

public interface TelegramNotificationService {
    boolean sendConflictAlert(SyncConflict conflict);
    boolean sendMessage(String message);
}
