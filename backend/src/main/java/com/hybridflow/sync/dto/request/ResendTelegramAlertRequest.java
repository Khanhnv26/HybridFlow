package com.hybridflow.sync.dto.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ResendTelegramAlertRequest {
    private String chatId;
}
