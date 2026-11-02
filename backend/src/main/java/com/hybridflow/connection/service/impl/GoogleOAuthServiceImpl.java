package com.hybridflow.connection.service.impl;

import com.google.api.client.googleapis.auth.oauth2.GoogleAuthorizationCodeFlow;
import com.google.api.client.googleapis.auth.oauth2.GoogleClientSecrets;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.hybridflow.connection.service.GoogleOAuthService;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStreamReader;
import java.util.List;

@Service
public class GoogleOAuthServiceImpl implements GoogleOAuthService {

    private static final List <String> SCOPES = List.of(SheetsScopes.SPREADSHEETS);

    @Value("${google.oauth.redirect-uri}")
    private String redirectUri;

    private GoogleAuthorizationCodeFlow flow;

    @PostConstruct
    public void init() {
        try {
            ClassPathResource resource = new ClassPathResource("client_secret.json");
            GoogleClientSecrets clientSecrets = GoogleClientSecrets.load(
                    GsonFactory.getDefaultInstance(),
                    new InputStreamReader(resource.getInputStream()));

            this.flow = new GoogleAuthorizationCodeFlow.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(),
                    GsonFactory.getDefaultInstance(),
                    clientSecrets,
                    SCOPES).setAccessType("offline").build();



        } catch (Exception e) {
            throw new RuntimeException("Không thể khởi tạo Google OAuth", e);
        }
    }

    @Override
    public String buildAuthorizationUrl() {
        if (flow == null) {
            throw new IllegalStateException("GoogleAuthorizationCodeFlow chưa được khởi tạo.");
        }

        return flow.newAuthorizationUrl()
                .setRedirectUri(redirectUri)
                .build();
    }

    @Override
    public GoogleTokenResponse exChangeCode(String code) {
        try {
            return flow.newTokenRequest(code)
                    .setRedirectUri(redirectUri)
                    .execute();
        } catch (Exception e) {
            throw new RuntimeException("Đổi token Google thất bại", e);
        }
    }
}
