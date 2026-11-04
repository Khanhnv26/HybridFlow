package com.hybridflow.auth.service;

import com.hybridflow.auth.dto.response.CsrfResponse;
import com.hybridflow.auth.dto.response.MeResponse;
import org.springframework.security.web.csrf.CsrfToken;

public interface AuthService {
    MeResponse me();
    CsrfResponse csrf(CsrfToken token);
    String googleLoginUrl();
}
