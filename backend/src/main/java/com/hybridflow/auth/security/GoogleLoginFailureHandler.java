package com.hybridflow.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Set;

@Component
@Slf4j
public class GoogleLoginFailureHandler extends SimpleUrlAuthenticationFailureHandler {
    private static final Set<String> SAFE_CODES = Set.of("authorization_request_not_found", "invalid_state_parameter",
            "invalid_token_response", "invalid_id_token", "invalid_user_info_response", "access_denied",
            "invalid_client", "invalid_grant", "server_error", "temporarily_unavailable");
    private final String frontend;

    public GoogleLoginFailureHandler(@Value("${app.frontend-origin:http://localhost:3000}") String frontend) {
        this.frontend = frontend.replaceAll("/+$", "");
    }

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
                                        AuthenticationException exception) throws IOException {
        String code = "authentication_failed";
        if (exception instanceof OAuth2AuthenticationException oauth && SAFE_CODES.contains(oauth.getError().getErrorCode())) {
            code = oauth.getError().getErrorCode();
        }
        Throwable cause = exception;
        for (int depth = 0; depth < 10 && cause.getCause() != null; depth++) cause = cause.getCause();
        log.warn("Google login failed code={} exceptionType={} causeType={}", code,
                exception.getClass().getSimpleName(), cause.getClass().getSimpleName());
        response.setHeader("Cache-Control", "no-store");
        getRedirectStrategy().sendRedirect(request, response, frontend + "/?login=failed&reason=" + code);
    }
}
