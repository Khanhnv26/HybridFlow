package com.hybridflow.connection.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;

public interface GoogleCredentialService {
    String store(GoogleTokenResponse token);
    String storeInCurrentTransaction(GoogleTokenResponse token);
    String resolveAccessToken(String reference);
}
