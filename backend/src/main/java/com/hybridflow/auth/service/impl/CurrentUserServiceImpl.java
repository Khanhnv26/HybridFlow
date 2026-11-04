package com.hybridflow.auth.service.impl;

import com.hybridflow.auth.dto.response.MeResponse;
import com.hybridflow.auth.repository.AccountRepository;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CurrentUserServiceImpl implements CurrentUserService {

    private final AccountRepository accountRepository;

    @Override
    @Transactional(readOnly = true)
    public MeResponse requireUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if(auth == null ||!(auth.getPrincipal() instanceof OidcUser)) {
            throw new ApplicationException(ErrorCode.AUTHENTICATION_REQUIRED);
        }

        OidcUser principal = (OidcUser) auth.getPrincipal();
        return accountRepository.findBySubject(principal.getSubject())
                .orElseThrow(() -> new ApplicationException(ErrorCode.AUTHENTICATION_REQUIRED));
    }

    @Override
    @Transactional(readOnly = true)
    public UUID requireUserId() {
        return requireUser().getId();
    }
}
