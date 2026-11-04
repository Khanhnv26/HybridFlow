package com.hybridflow.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class GoogleLoginFailureHandlerTest {
    @Test void reportsSafeErrorCodeWithoutProviderDescription() throws Exception {
        GoogleLoginFailureHandler handler = new GoogleLoginFailureHandler("http://localhost:3000");
        MockHttpServletResponse response = new MockHttpServletResponse();
        handler.onAuthenticationFailure(new MockHttpServletRequest(), response,
                new OAuth2AuthenticationException(new OAuth2Error("invalid_token_response", "secret-token", null)));
        assertEquals("http://localhost:3000/?login=failed&reason=invalid_token_response", response.getRedirectedUrl());
        assertFalse(response.getRedirectedUrl().contains("secret-token"));
        assertEquals("no-store", response.getHeader("Cache-Control"));
    }

    @Test void unknownProviderCodeIsNotReflectedInRedirect() throws Exception {
        GoogleLoginFailureHandler handler = new GoogleLoginFailureHandler("http://localhost:3000/");
        MockHttpServletResponse response = new MockHttpServletResponse();
        handler.onAuthenticationFailure(new MockHttpServletRequest(), response,
                new OAuth2AuthenticationException(new OAuth2Error("sensitive-unexpected-code")));
        assertEquals("http://localhost:3000/?login=failed&reason=authentication_failed", response.getRedirectedUrl());
    }
}
