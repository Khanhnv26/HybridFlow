package com.hybridflow.notification.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TelegramRecipientResponse {
    private String chatId;
    private String name;
    private String recipientType;
}
