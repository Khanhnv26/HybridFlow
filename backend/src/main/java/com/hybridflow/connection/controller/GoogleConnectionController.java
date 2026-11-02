package com.hybridflow.connection.controller;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.connection.dto.GoogleCallbackResponse;

import com.hybridflow.connection.service.GoogleOAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@RestController
@RequestMapping("/api/v1/connections/google")
@RequiredArgsConstructor
public class GoogleConnectionController {

    private final GoogleOAuthService googleOAuthService;

    @GetMapping("/start")
    public RedirectView startGoogleOAuth() {
        String authorizationUrl = googleOAuthService.buildAuthorizationUrl();
        return new RedirectView(authorizationUrl);
    }

    @GetMapping("/callback")
    public ResponseEntity<GoogleCallbackResponse> handleGoogleOAuthCallback(@RequestParam("code") String code) {
        GoogleTokenResponse tokenResponse = googleOAuthService.exChangeCode(code);
        GoogleCallbackResponse callbackResponse = GoogleCallbackResponse.builder()
                .status("success")
                .message("Đã kết nối Google Sheets thành công!")
                .data(tokenResponse)
                .build();
        return ResponseEntity.ok(callbackResponse);

    }
}
