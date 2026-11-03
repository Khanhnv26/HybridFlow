package com.hybridflow.connection.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class GoogleOAuthCallbackResponse {
    private final int status;
    private final String html;
}
