package com.hybridflow.connection.service.impl;

import com.google.api.client.auth.oauth2.TokenResponseException;
import com.google.api.client.googleapis.auth.oauth2.GoogleAuthorizationCodeFlow;
import com.google.api.client.googleapis.auth.oauth2.GoogleAuthorizationCodeRequestUrl;
import com.google.api.client.googleapis.auth.oauth2.GoogleClientSecrets;
import com.google.api.client.googleapis.auth.oauth2.GoogleRefreshTokenRequest;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.GenericUrl;
import com.google.api.client.http.HttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.SheetsScopes;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.util.ExternalErrors;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import com.hybridflow.connection.service.GoogleOAuthService;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;

@Service
public class GoogleOAuthServiceImpl implements GoogleOAuthService {

    private static final List <String> SCOPES = List.of(SheetsScopes.SPREADSHEETS);

    @Value("${google.oauth.redirect-uri}")
    private String redirectUri;

    private GoogleAuthorizationCodeFlow flow;
    private GoogleClientSecrets clientSecrets;
    private HttpTransport transport;

    @Value("${google.oauth.token-uri:https://oauth2.googleapis.com/token}")
    private String tokenUri = "https://oauth2.googleapis.com/token";

    @PostConstruct
    public void init() {
        try {
            ClassPathResource resource = new ClassPathResource("client_secret.json");
            clientSecrets = GoogleClientSecrets.load(
                    GsonFactory.getDefaultInstance(),
                    new InputStreamReader(resource.getInputStream()));

            transport = GoogleNetHttpTransport.newTrustedTransport();
            this.flow = new GoogleAuthorizationCodeFlow.Builder(
                    transport,
                    GsonFactory.getDefaultInstance(),
                    clientSecrets,
                    SCOPES).setAccessType("offline").build();



        } catch (Exception e) {
            throw new ApplicationException(ErrorCode.CONFIGURATION_ERROR, "Không thể khởi tạo Google OAuth.", e);
        }
    }

    @Override
    public String buildAuthorizationUrl() {
        return buildAuthorizationUrl(null);
    }

    @Override
    public String buildAuthorizationUrl(String state) {
        return buildAuthorizationUrl(state, redirectUri);
    }

    @Override
    public String buildAuthorizationUrl(String state, String callbackUri) {
        if (flow == null) {
            throw new ApplicationException(ErrorCode.CONFIGURATION_ERROR);
        }

        GoogleAuthorizationCodeRequestUrl url = flow.newAuthorizationUrl()
                .set("prompt", "consent")
                .setRedirectUri(callbackUri);
        if (state != null) {
            url.setState(state);
        }
        return url.build();
    }

    @Override
    public GoogleTokenResponse exChangeCode(String code) {
        return exChangeCode(code, redirectUri);
    }

    @Override
    public GoogleTokenResponse exChangeCode(String code, String callbackUri) {
        try {
            return flow.newTokenRequest(code)
                    .setRedirectUri(callbackUri)
                    .execute();
        } catch (TokenResponseException exception) {
            throw ExternalErrors.google(exception.getStatusCode(), 0);
        } catch (IOException exception) {
            throw new ApplicationException(ErrorCode.UPSTREAM_UNAVAILABLE, "Chưa đổi được mã kết nối Google. Vui lòng thử kết nối lại.", exception);
        }
    }

    @Override
    public GoogleTokenResponse refreshToken(String refreshToken) {
        try {
            return new GoogleRefreshTokenRequest(transport, GsonFactory.getDefaultInstance(), refreshToken,
                    clientSecrets.getDetails().getClientId(), clientSecrets.getDetails().getClientSecret())
                    .setTokenServerUrl(new GenericUrl(tokenUri)).execute();
        } catch (TokenResponseException exception) {
            if (exception.getDetails() != null && "invalid_grant".equals(exception.getDetails().getError()))
                throw new GoogleReconnectRequiredException();
            throw ExternalErrors.google(exception.getStatusCode(), 0);
        } catch (IOException exception) {
            throw new ApplicationException(ErrorCode.UPSTREAM_UNAVAILABLE);
        }
    }
}
