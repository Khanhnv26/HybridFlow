package com.hybridflow.connection.controller;

import com.hybridflow.connection.dto.GoogleOAuthConfigResponse;
import com.hybridflow.connection.service.GoogleConnectionService;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@RestController
@RequestMapping("/api/v1/connections/google")
@RequiredArgsConstructor
public class GoogleConnectionController {
    private final GoogleConnectionService connectionService;
    private final GoogleSheetsService googleSheetsService;

    @GetMapping("/config")
    public GoogleOAuthConfigResponse config() {
        return connectionService.getConfiguration();
    }

    @GetMapping("/start")
    public RedirectView startGoogleOAuth() {
        return new RedirectView(connectionService.getAuthorizationUrl());
    }

    @GetMapping(value = "/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> handleGoogleOAuthCallback(@RequestParam("code") String code) {
        return ResponseEntity.ok(connectionService.completeAuthorization(code));
    }

    @PostMapping("/sheets/read")
    public ResponseEntity<SheetDataResponse> readSheet(@RequestBody ReadSheetRequest request) {
        return ResponseEntity.ok(googleSheetsService.readSheet(request));
    }

    @PostMapping("/sheets/metadata")
    public ResponseEntity<SpreadsheetMetadataResponse> getSpreadsheetMetadata(@RequestBody ReadSheetRequest request) {
        return ResponseEntity.ok(googleSheetsService.getMetadata(request));
    }

    @PostMapping("/sheets/update")
    public ResponseEntity<UpdateCellResponse> updateCell(@RequestBody UpdateCellRequest request) {
        return ResponseEntity.ok(googleSheetsService.updateCell(request));
    }
}
