package com.hybridflow.connection.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;

public interface GoogleOAuthService {
    String buildAuthorizationUrl();
    String buildAuthorizationUrl(String state);
    GoogleTokenResponse exChangeCode(String code);
    GoogleTokenResponse refreshToken(String refreshToken);
}
