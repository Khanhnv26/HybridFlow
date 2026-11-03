package com.hybridflow.connection.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.connection.service.impl.GoogleConnectionServiceImpl;
import com.hybridflow.connection.view.GoogleOAuthCallbackRenderer;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GoogleConnectionServiceTest {
    @Test
    void configurationAndTokenExchangeAreHandledOutsideTheController() {
        GoogleOAuthService oauth = mock(GoogleOAuthService.class);
        GoogleOAuthCallbackRenderer renderer = mock(GoogleOAuthCallbackRenderer.class);
        GoogleCredentialService credentials = mock(GoogleCredentialService.class);
        GoogleConnectionService service = new GoogleConnectionServiceImpl(oauth, renderer, credentials);
        ReflectionTestUtils.setField(service, "redirectUri", "https://backend.example/api/v1/connections/google/callback");
        ReflectionTestUtils.setField(service, "frontendOrigin", "https://frontend.example");
        when(oauth.exChangeCode("code")).thenReturn(new GoogleTokenResponse().setAccessToken("test-token"));
        when(credentials.store(any())).thenReturn("gconn-test");
        when(renderer.render("gconn-test", "https://frontend.example")).thenReturn("callback-html");
        assertEquals("https://backend.example", service.getConfiguration().getCallbackOrigin());
        assertEquals("callback-html", service.completeAuthorization("code"));
        verify(renderer).render("gconn-test", "https://frontend.example");
    }

    @Test
    void callbackTemplateEscapesValuesEmbeddedInJavascript() {
        GoogleOAuthCallbackRenderer renderer = new GoogleOAuthCallbackRenderer(new ObjectMapper());
        String html = renderer.render("token</script><script>alert(1)</script>", "https://frontend.example");
        assertFalse(html.contains("{{ACCESS_TOKEN}}"));
        assertFalse(html.contains("token</script>"));
        assertTrue(html.contains("\\u003c/script\\u003e"));
        assertTrue(html.contains("\"https://frontend.example\""));
    }
}
