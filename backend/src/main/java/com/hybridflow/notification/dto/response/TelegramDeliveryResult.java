package com.hybridflow.notification.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TelegramDeliveryResult {
    private boolean success;
    private boolean retryable;
    private int retryAfterSeconds;
    private String error;
}
