package com.hybridflow.connection.service.impl;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import com.hybridflow.connection.model.GoogleConnection;
import com.hybridflow.connection.repository.GoogleConnectionRepository;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connection.support.GoogleTokenCipher;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class GoogleCredentialServiceImpl implements GoogleCredentialService {
    private final GoogleConnectionRepository repository;
    private final GoogleOAuthService oauth;
    private final GoogleTokenCipher cipher;
    private final Clock clock;
    private final PlatformTransactionManager transactions;

    private TransactionTemplate transaction() {
        TransactionTemplate template = new TransactionTemplate(transactions);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template;
    }

    @Override
    public String store(GoogleTokenResponse token) {
        if (token.getAccessToken() == null || token.getAccessToken().isBlank()) throw new GoogleReconnectRequiredException();
        String id = "gconn-" + UUID.randomUUID();
        transaction().executeWithoutResult(status -> repository.save(new GoogleConnection(id, cipher.encrypt(token.getAccessToken()),
                cipher.encrypt(token.getRefreshToken()), clock.instant().plusSeconds(token.getExpiresInSeconds() == null ? 3600 : token.getExpiresInSeconds()), "ACTIVE")));
        return id;
    }

    @Override
    public String resolveAccessToken(String reference) {
        if (reference == null || reference.isBlank()) throw new GoogleReconnectRequiredException();
        // Preserve the explicit bearer-token API for existing callers. Only opaque connections are persisted.
        if (!reference.startsWith("gconn-")) return reference;
        String resolved = transaction().execute(status -> {
            GoogleConnection connection = repository.lock(reference).orElseThrow(GoogleReconnectRequiredException::new);
            if (!"ACTIVE".equals(connection.getState())) return null;
            if (connection.getExpiresAt().isAfter(clock.instant().plusSeconds(60))) return cipher.decrypt(connection.getAccessToken());
            if (connection.getRefreshToken() == null) {
                repository.requireReconnect(reference);
                return null;
            }
            try {
                GoogleTokenResponse token = oauth.refreshToken(cipher.decrypt(connection.getRefreshToken()));
                if (token.getAccessToken() == null || token.getExpiresInSeconds() == null) throw new ApplicationException(ErrorCode.UPSTREAM_FAILURE, "Google trả về token không hợp lệ.");
                repository.save(new GoogleConnection(reference, cipher.encrypt(token.getAccessToken()),
                        token.getRefreshToken() == null ? connection.getRefreshToken() : cipher.encrypt(token.getRefreshToken()),
                        clock.instant().plusSeconds(token.getExpiresInSeconds()), "ACTIVE"));
                return token.getAccessToken();
            } catch (GoogleReconnectRequiredException exception) {
                repository.requireReconnect(reference);
                return null;
            }
        });
        if (resolved == null) throw new GoogleReconnectRequiredException();
        return resolved;
    }
}
