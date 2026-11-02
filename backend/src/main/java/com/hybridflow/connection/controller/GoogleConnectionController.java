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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.view.RedirectView;
import org.springframework.beans.factory.annotation.Value;
import java.net.URI;

@RestController
@RequestMapping("/api/v1/connections/google")
@RequiredArgsConstructor
public class GoogleConnectionController {

    private final GoogleOAuthService googleOAuthService;
    private final GoogleSheetsService googleSheetsService;

    @Value("${google.oauth.redirect-uri}")
    private String redirectUri;

    @Value("${app.frontend-origin:http://localhost:3000}")
    private String frontendOrigin;

    @GetMapping("/config")
    public java.util.Map<String, String> config() {
        URI uri = URI.create(redirectUri);
        return java.util.Map.of("callbackOrigin", uri.getScheme() + "://" + uri.getAuthority());
    }

    @GetMapping("/start")
    public RedirectView startGoogleOAuth() {
        String authorizationUrl = googleOAuthService.buildAuthorizationUrl();
        return new RedirectView(authorizationUrl);
    }

    @GetMapping(value = "/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> handleGoogleOAuthCallback(@RequestParam("code") String code) {
        GoogleTokenResponse tokenResponse = googleOAuthService.exChangeCode(code);
        String accessToken = tokenResponse.getAccessToken();
        String html = """
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><title>Kết nối Google thành công</title></head>
                <body style="background:#0f131a;color:#10b981;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
                    <h3>✅ Đã kết nối Google Sheets thành công! Cửa sổ sẽ tự đóng...</h3>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'GOOGLE_OAUTH_SUCCESS',
                                accessToken: '%s'
                            }, '%s');
                        }
                        setTimeout(() => window.close(), 1000);
                    </script>
                </body>
                </html>
                """.formatted(accessToken, frontendOrigin);
        return ResponseEntity.ok(html);





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
