package com.hybridflow.notification.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TelegramTestResponse {
    private boolean success;
    private String message;
    private TelegramRecipientResponse recipient;
}
