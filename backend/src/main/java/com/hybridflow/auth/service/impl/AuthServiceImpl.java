package com.hybridflow.auth.service.impl;

import com.hybridflow.auth.dto.response.CsrfResponse;
import com.hybridflow.auth.dto.response.MeResponse;
import com.hybridflow.auth.service.AuthService;
import com.hybridflow.auth.service.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final CurrentUserService currentUserService;

    @Override
    public MeResponse me() {
        return currentUserService.requireUser();
    }

    @Override
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @Override
    public String googleLoginUrl() {
        return "/oauth2/authorization/google";
    }
}
