package com.hybridflow.notification.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TelegramBotInfoResponse {
    private boolean configured;
    private String username;
    private String displayName;
    private boolean canJoinGroups;
    private String message;
}
