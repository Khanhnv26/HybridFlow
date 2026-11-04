package com.hybridflow.auth.controller;

import com.hybridflow.auth.dto.response.CsrfResponse;
import com.hybridflow.auth.dto.response.MeResponse;
import com.hybridflow.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me () {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(authService.me());
    }

    @GetMapping("/csrf")
    public ResponseEntity<CsrfResponse> csrf(CsrfToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(authService.csrf(token));
    }

    @GetMapping("/login/google")
    public RedirectView google() {
        return new RedirectView(authService.googleLoginUrl());
    }
}
