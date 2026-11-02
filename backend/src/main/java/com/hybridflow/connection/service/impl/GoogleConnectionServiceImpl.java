package com.hybridflow.connection.service.impl;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.connection.dto.GoogleOAuthConfigResponse;
import com.hybridflow.connection.service.GoogleConnectionService;
import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connection.view.GoogleOAuthCallbackRenderer;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;

@Service
@RequiredArgsConstructor
public class GoogleConnectionServiceImpl implements GoogleConnectionService {
    private final GoogleOAuthService oauth;
    private final GoogleOAuthCallbackRenderer renderer;

    @Value("${google.oauth.redirect-uri}")
    private String redirectUri;

    @Value("${app.frontend-origin:http://localhost:3000}")
    private String frontendOrigin;

    @Override
    public GoogleOAuthConfigResponse getConfiguration() {
        URI callback = URI.create(redirectUri);
        return new GoogleOAuthConfigResponse(callback.getScheme() + "://" + callback.getAuthority());
    }

    @Override
    public String getAuthorizationUrl() {
        return oauth.buildAuthorizationUrl();
    }

    @Override
    public String completeAuthorization(String code) {
        GoogleTokenResponse token = oauth.exChangeCode(code);
        return renderer.render(token.getAccessToken(), frontendOrigin);
    }
}
