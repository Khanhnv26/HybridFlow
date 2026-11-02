package com.hybridflow.sync.dto.response;

import lombok.*;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Builder
public class TelegramAlertResponse {
    private Long id;
    private boolean success;
    private String message;
}
