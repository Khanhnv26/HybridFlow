package com.hybridflow.connection.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;

public interface GoogleOAuthService {
    String buildAuthorizationUrl();
    GoogleTokenResponse exChangeCode(String code);
}
