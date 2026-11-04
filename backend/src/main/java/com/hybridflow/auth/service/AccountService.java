package com.hybridflow.auth.service;

import com.hybridflow.auth.dto.response.CsrfResponse;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.csrf.CsrfToken;

public interface AccountService {
    void saveGoogleUser(OidcUser oidcUser);
}
