package com.hybridflow.connection.service;

import com.hybridflow.connection.service.impl.GoogleOAuthServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoogleOAuthServiceTest {

    @Test
    void shouldInitializeWithEnvironmentCredentialsWhenFileAbsent() {
        GoogleOAuthServiceImpl service = new GoogleOAuthServiceImpl();
        ReflectionTestUtils.setField(service, "redirectUri", "http://localhost:8080/api/v1/connections/google/callback");
        ReflectionTestUtils.setField(service, "tokenUri", "https://oauth2.googleapis.com/token");
        ReflectionTestUtils.setField(service, "clientId", "test-client-id.apps.googleusercontent.com");
        ReflectionTestUtils.setField(service, "clientSecret", "test-client-secret");

        service.init();

        String authUrl = service.buildAuthorizationUrl("test-state");
        assertNotNull(authUrl);
        assertTrue(authUrl.contains("test-client-id.apps.googleusercontent.com"));
        assertTrue(authUrl.contains("test-state"));
    }
}
