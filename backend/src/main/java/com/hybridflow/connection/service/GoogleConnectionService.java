package com.hybridflow.connection.service;

import com.hybridflow.connection.dto.GoogleOAuthCallbackResponse;
import com.hybridflow.connection.dto.GoogleOAuthConfigResponse;

public interface GoogleConnectionService {
    GoogleOAuthConfigResponse getConfiguration();
    String getAuthorizationUrl();
    String completeAuthorization(String code);
    GoogleOAuthCallbackResponse completeAuthorization(String code, String providerError);
}
