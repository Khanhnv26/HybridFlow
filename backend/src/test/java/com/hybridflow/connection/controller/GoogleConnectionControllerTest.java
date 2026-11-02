package com.hybridflow.connection.controller;

import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.connection.service.GoogleConnectionService;
import com.hybridflow.connection.dto.GoogleOAuthConfigResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class GoogleConnectionControllerTest {
    @Mock GoogleConnectionService connection;
    @Mock GoogleSheetsService sheets;
    private MockMvc mvc;

    @BeforeEach void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new GoogleConnectionController(connection, sheets))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test void metadataEndpointAcceptsTheSelectedFileAndReturnsDropdownOptions() throws Exception {
        when(sheets.getMetadata(any())).thenReturn(new SpreadsheetMetadataResponse("file", "Orders workbook",
                List.of(new SpreadsheetMetadataResponse.SheetTab(0, "Orders"))));
        mvc.perform(post("/api/v1/connections/google/sheets/metadata").contentType(MediaType.APPLICATION_JSON)
                .content("{\"spreadsheetId\":\"file\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.spreadsheetId").value("file"))
                .andExpect(jsonPath("$.sheets[0].sheetId").value(0))
                .andExpect(jsonPath("$.sheets[0].title").value("Orders"));
        verify(sheets).getMetadata(argThat(request -> request.getSpreadsheetId().equals("file")
                && request.getAccessToken().equals("test-token")));
        verify(sheets, never()).readSheet(any());
    }

    @Test void accessFailureIsReturnedAsAnErrorWithoutSampleOptions() throws Exception {
        when(sheets.getMetadata(any())).thenThrow(new IllegalArgumentException("Không có quyền truy cập file."));
        mvc.perform(post("/api/v1/connections/google/sheets/metadata").contentType(MediaType.APPLICATION_JSON)
                .content("{\"spreadsheetId\":\"file\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Không có quyền truy cập file."))
                .andExpect(jsonPath("$.sheets").doesNotExist());
    }

    @Test void configurationIsDelegatedToTheConnectionService() throws Exception {
        when(connection.getConfiguration()).thenReturn(new GoogleOAuthConfigResponse("https://backend.example"));
        mvc.perform(get("/api/v1/connections/google/config")).andExpect(status().isOk())
                .andExpect(jsonPath("$.callbackOrigin").value("https://backend.example"));
    }

    @Test void authorizationRedirectKeepsTheSameHttpContract() throws Exception {
        when(connection.getAuthorizationUrl()).thenReturn("https://accounts.google.com/authorization");
        mvc.perform(get("/api/v1/connections/google/start")).andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("https://accounts.google.com/authorization"));
    }

    @Test void callbackOnlyReturnsThePagePreparedByTheService() throws Exception {
        when(connection.completeAuthorization("code")).thenReturn("<html>Connected</html>");
        mvc.perform(get("/api/v1/connections/google/callback").param("code", "code"))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string("<html>Connected</html>"));
        verify(connection).completeAuthorization("code");
    }
}
