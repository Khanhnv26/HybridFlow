package com.hybridflow.connection.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleClientSecrets;
import com.google.api.client.testing.http.*;
import com.hybridflow.connection.service.impl.GoogleOAuthServiceImpl;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import com.hybridflow.connection.support.GoogleTokenCipher;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class GoogleTokenRefreshTest {
    private GoogleOAuthServiceImpl oauth(int status, String json, AtomicReference<MockLowLevelHttpRequest> sent) {
        GoogleOAuthServiceImpl service = new GoogleOAuthServiceImpl();
        ReflectionTestUtils.setField(service, "clientSecrets", new GoogleClientSecrets().setWeb(
                new GoogleClientSecrets.Details().setClientId("test-client").setClientSecret("test-secret")));
        ReflectionTestUtils.setField(service, "transport", new MockHttpTransport() {
            @Override public MockLowLevelHttpRequest buildRequest(String method, String url) {
                assertEquals("POST", method);
                assertEquals("https://oauth2.googleapis.com/token", url);
                MockLowLevelHttpRequest request = new MockLowLevelHttpRequest(url).setResponse(new MockLowLevelHttpResponse()
                        .setStatusCode(status).setContentType("application/json").setContent(json));
                sent.set(request);
                return request;
            }
        });
        return service;
    }

    @Test void refreshUsesOAuthFormAndParsesNewExpiry() throws Exception {
        AtomicReference<MockLowLevelHttpRequest> sent = new AtomicReference<>();
        com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse token = oauth(200,
                "{\"access_token\":\"renewed\",\"expires_in\":3600,\"token_type\":\"Bearer\"}", sent).refreshToken("test-refresh");
        assertEquals("renewed", token.getAccessToken());
        assertEquals(3600L, token.getExpiresInSeconds());
        assertTrue(sent.get().getContentAsString().contains("grant_type=refresh_token"));
        assertTrue(sent.get().getContentAsString().contains("refresh_token=test-refresh"));
    }

    @Test void invalidGrantRequiresReconnectWithoutExposingProviderResponse() {
        GoogleReconnectRequiredException error = assertThrows(GoogleReconnectRequiredException.class, () -> oauth(400,
                "{\"error\":\"invalid_grant\",\"error_description\":\"private-provider-detail\"}", new AtomicReference<>()).refreshToken("test-refresh"));
        assertFalse(error.getMessage().contains("private-provider-detail"));
        assertNull(error.getCause());
    }

    @Test void providerFailureRemainsRetryable() {
        assertThrows(IllegalStateException.class, () -> oauth(503, "{\"error\":\"temporarily_unavailable\"}", new AtomicReference<>()).refreshToken("test-refresh"));
    }

    @Test void tokensAreAuthenticatedEncryptedAndWrongKeyCannotDecrypt() {
        GoogleTokenCipher cipher = new GoogleTokenCipher("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        String encrypted = cipher.encrypt("test-refresh");
        assertNotEquals(encrypted, cipher.encrypt("test-refresh"));
        assertFalse(encrypted.contains("test-refresh"));
        assertEquals("test-refresh", cipher.decrypt(encrypted));
        assertThrows(IllegalStateException.class, () -> new GoogleTokenCipher("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=").decrypt(encrypted));
    }
}
