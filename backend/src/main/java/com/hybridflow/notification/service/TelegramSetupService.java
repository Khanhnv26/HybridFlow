package com.hybridflow.notification.service;

import com.hybridflow.notification.dto.response.TelegramBotInfoResponse;
import com.hybridflow.notification.dto.response.TelegramLinkResponse;
import com.hybridflow.notification.dto.response.TelegramRecipientResponse;
import com.hybridflow.notification.dto.response.TelegramTestResponse;

public interface TelegramSetupService {
    TelegramBotInfoResponse botInfo();
    TelegramLinkResponse startLink(String recipientType);
    TelegramLinkResponse poll(String id);
    TelegramRecipientResponse checkRecipient(String chatId, String recipientType);
    TelegramTestResponse sendTest(String chatId, String recipientType);
}
