package com.hybridflow.notification.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TelegramLinkResponse {
    private String id;
    private String status;
    private String url;
    private String command;
    private Instant expiresAt;
    private TelegramRecipientResponse recipient;
}
