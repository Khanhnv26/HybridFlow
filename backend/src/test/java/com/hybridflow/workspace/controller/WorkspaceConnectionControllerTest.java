package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.workspace.dto.request.CreateTelegramConnectionRequest;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import com.hybridflow.workspace.service.WorkspaceConnectionService;
import com.hybridflow.connection.dto.GoogleOAuthCallbackResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class WorkspaceConnectionControllerTest {
    @Mock
    private WorkspaceConnectionService service;

    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID workspaceId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new WorkspaceConnectionController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void startGoogleOAuthReturnsUrl() throws Exception {
        when(service.startGoogleOAuth(eq(workspaceId), eq("Google Sheets"), any()))
                .thenReturn("https://auth.google.com");
        when(service.googleCallbackOrigin()).thenReturn("http://localhost:8080");

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/connections/google/start"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").value("https://auth.google.com"));
    }

    @Test
    void completeGoogleOAuthReturnsConnection() throws Exception {
        when(service.completeGoogleOAuthPage(eq("code-1"), eq("state-1"), org.mockito.ArgumentMatchers.isNull(), any()))
                .thenReturn(new GoogleOAuthCallbackResponse(200, "<html>WORKSPACE_GOOGLE_CONNECTED</html>"));

        mvc.perform(get("/api/v1/workspaces/connections/google/callback")
                        .param("code", "code-1")
                        .param("state", "state-1"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string("<html>WORKSPACE_GOOGLE_CONNECTED</html>"));
    }

    @Test
    void createTelegramReturnsCreated() throws Exception {
        CreateTelegramConnectionRequest request = new CreateTelegramConnectionRequest();
        request.setName("Alerts");
        request.setBotToken("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11");

        when(service.createTelegram(eq(workspaceId), any()))
                .thenReturn(new WorkspaceConnectionResponse("t1", "Alerts", "TELEGRAM", "ACTIVE", 0));

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/connections/telegram")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("t1"));
    }

    @Test
    void listReturnsConnections() throws Exception {
        when(service.list(workspaceId))
                .thenReturn(List.of(new WorkspaceConnectionResponse("c1", "Sheets", "GOOGLE", "ACTIVE", 1)));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/connections"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("c1"));
    }

    @Test
    void grantRoleDelegatesToService() throws Exception {
        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/connections/c1/grants")
                        .param("role", "EDITOR"))
                .andExpect(status().isOk());

        verify(service).grantRole(workspaceId, "c1", "EDITOR");
    }

    @Test
    void revokeDelegatesToService() throws Exception {
        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/connections/c1/revoke"))
                .andExpect(status().isOk());

        verify(service).revoke(workspaceId, "c1");
    }

    @Test
    void deleteDelegatesToService() throws Exception {
        mvc.perform(delete("/api/v1/workspaces/" + workspaceId + "/connections/c1"))
                .andExpect(status().isOk());

        verify(service).delete(workspaceId, "c1");
    }

    @Test
    void getSheetMetadataReturnsMetadata() throws Exception {
        SpreadsheetMetadataResponse res = new SpreadsheetMetadataResponse("sheet-1", "Inventory", List.of());
        when(service.getSheetMetadata(workspaceId, "c1", "sheet-1")).thenReturn(res);

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/connections/c1/sheets/metadata")
                        .param("spreadsheetId", "sheet-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Inventory"));
    }

    @Test
    void readSheetReturnsData() throws Exception {
        ReadSheetRequest req = ReadSheetRequest.builder().spreadsheetId("sheet-1").sheetname("Tab1").build();
        SheetDataResponse res = SheetDataResponse.builder().spreadsheetId("sheet-1").totalRows(5).build();
        when(service.readSheet(eq(workspaceId), eq("c1"), any())).thenReturn(res);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/connections/c1/sheets/read")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(5));
    }

    @Test
    void updateCellReturnsResponse() throws Exception {
        UpdateCellRequest req = UpdateCellRequest.builder().spreadsheetId("sheet-1").range("A1").value("V").build();
        UpdateCellResponse res = UpdateCellResponse.builder().success(true).build();
        when(service.updateCell(eq(workspaceId), eq("c1"), any())).thenReturn(res);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/connections/c1/sheets/update")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void getTelegramInfoReturnsInfo() throws Exception {
        when(service.getTelegramInfo(workspaceId, "t1"))
                .thenReturn(Map.of("configured", true, "botUsername", "my_bot"));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/connections/t1/telegram/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.botUsername").value("my_bot"));
    }
}
