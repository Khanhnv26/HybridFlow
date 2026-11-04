package com.hybridflow.connection.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;

public interface GoogleOAuthService {
    String buildAuthorizationUrl();
    String buildAuthorizationUrl(String state);
    String buildAuthorizationUrl(String state, String redirectUri);
    GoogleTokenResponse exChangeCode(String code);
    GoogleTokenResponse exChangeCode(String code, String redirectUri);
    GoogleTokenResponse refreshToken(String refreshToken);
}
