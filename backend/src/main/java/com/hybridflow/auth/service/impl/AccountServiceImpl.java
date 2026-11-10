package com.hybridflow.auth.service.impl;

import com.hybridflow.auth.repository.AccountRepository;
import com.hybridflow.auth.service.AccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AccountServiceImpl implements AccountService {

    private final AccountRepository accountRepository;

    @Override
    @Transactional
    public void saveGoogleUser(OidcUser user) {
        if(!Boolean.TRUE.equals(user.getEmailVerified()) || user.getEmail() == null) {
            throw new OAuth2AuthenticationException("Email is not verified or is null");
        }
        String email = user.getEmail().trim().toLowerCase(Locale.ROOT);
        String name = user.getFullName() == null ? email : user.getFullName();
        String picture = user.getPicture();
        accountRepository.upsertGoogle(user.getSubject(), email, name, picture);
    }

}
