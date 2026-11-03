package com.hybridflow.connection.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.connection.dto.GoogleOAuthCallbackResponse;
import com.hybridflow.connection.service.impl.GoogleConnectionServiceImpl;
import com.hybridflow.connection.view.GoogleOAuthCallbackRenderer;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GoogleConnectionServiceTest {
    @Test
    void deniedOrFailedOAuthReturnsSafeHtmlWithoutLeakingProviderData() {
        GoogleOAuthService oauth = mock(GoogleOAuthService.class);
        GoogleCredentialService credentials = mock(GoogleCredentialService.class);
        GoogleConnectionService service = new GoogleConnectionServiceImpl(oauth,
                new GoogleOAuthCallbackRenderer(new ObjectMapper()), credentials);
        ReflectionTestUtils.setField(service, "frontendOrigin", "https://frontend.example");
        GoogleOAuthCallbackResponse denied = service.completeAuthorization(null, "provider-secret");
        assertEquals(400, denied.getStatus());
        assertTrue(denied.getHtml().contains(ErrorCode.OAUTH_CANCELLED.name()));
        assertTrue(denied.getHtml().contains("GOOGLE_OAUTH_ERROR"));
        assertFalse(denied.getHtml().contains("provider-secret"));
        verifyNoInteractions(oauth, credentials);
        when(oauth.exChangeCode("code")).thenThrow(new RuntimeException("access_token=private-token"));
        GoogleOAuthCallbackResponse failed = service.completeAuthorization("code", null);
        assertEquals(500, failed.getStatus());
        assertFalse(failed.getHtml().contains("private-token"));
        assertTrue(failed.getHtml().contains("correlationId"));
    }

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
