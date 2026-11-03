package com.hybridflow.connection.service.impl;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.common.util.ErrorClassifier;
import com.hybridflow.connection.dto.GoogleOAuthCallbackResponse;
import com.hybridflow.connection.dto.GoogleOAuthConfigResponse;
import com.hybridflow.connection.service.GoogleConnectionService;
import com.hybridflow.connection.service.GoogleCredentialService;
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
    private final GoogleCredentialService credentials;

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
    public GoogleOAuthCallbackResponse completeAuthorization(String code, String providerError) {
        try {
            if (providerError != null) throw new ApplicationException(ErrorCode.OAUTH_CANCELLED);
            if (code == null || code.isBlank()) throw new ValidationException("Thiếu mã xác nhận kết nối Google. Vui lòng mở kết nối lại.");
            return new GoogleOAuthCallbackResponse(200, completeAuthorization(code));
        } catch (RuntimeException exception) {
            ErrorDetails details = ErrorClassifier.classify(exception);
            return new GoogleOAuthCallbackResponse(details.getCode().getStatus(), renderer.renderFailure(details, frontendOrigin));
        }
    }

    @Override
    public String completeAuthorization(String code) {
        GoogleTokenResponse token = oauth.exChangeCode(code);
        return renderer.render(credentials.store(token), frontendOrigin);
    }
}
