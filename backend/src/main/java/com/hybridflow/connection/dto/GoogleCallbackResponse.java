package com.hybridflow.connection.dto;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import lombok.*;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Builder
public class GoogleCallbackResponse {
    private String status;
    private String message;
    private GoogleTokenResponse data;
}
