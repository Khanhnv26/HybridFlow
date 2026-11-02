package com.hybridflow.connection.controller;

import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.connection.dto.GoogleCallbackResponse;

import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.view.RedirectView;

@RestController
@RequestMapping("/api/v1/connections/google")
@RequiredArgsConstructor
public class GoogleConnectionController {

    private final GoogleOAuthService googleOAuthService;
    private final GoogleSheetsService googleSheetsService;

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

    @PostMapping("/sheets/read")
    public ResponseEntity<SheetDataResponse> readSheet(@RequestBody ReadSheetRequest request) {
        return ResponseEntity.ok(googleSheetsService.readSheet(request));
    }

    @PostMapping("/sheets/update")
    public ResponseEntity<UpdateCellResponse> updateCell(@RequestBody UpdateCellRequest request) {
        return ResponseEntity.ok(googleSheetsService.updateCell(request));
    }
    
}
