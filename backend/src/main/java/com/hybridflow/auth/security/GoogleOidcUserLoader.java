package com.hybridflow.auth.security;

import com.hybridflow.auth.service.AccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class GoogleOidcUserLoader implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private final AccountService accountService;
    private final OidcUserService delegate = new OidcUserService();

    @Override
    @Transactional
    public OidcUser loadUser(OidcUserRequest userRequest) {
        OidcUser user = delegate.loadUser(userRequest);
        accountService.saveGoogleUser(user);
        return user;
    }
}
