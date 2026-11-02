package com.hybridflow.connection.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class GoogleOAuthConfigResponse {
    private final String callbackOrigin;
}
