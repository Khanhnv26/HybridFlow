package com.hybridflow.notification.dto.request;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TelegramDestinationRequest {
    private String chatId;
    private String recipientType;
}
