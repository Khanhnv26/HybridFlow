package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.workspace.dto.request.CreateTelegramConnectionRequest;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import com.hybridflow.workspace.service.WorkspaceConnectionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
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

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/connections/google/start"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").value("https://auth.google.com"));
    }

    @Test
    void completeGoogleOAuthReturnsConnection() throws Exception {
        when(service.completeGoogleOAuth(eq("code-1"), eq("state-1"), any()))
                .thenReturn(new WorkspaceConnectionResponse("c1", "Sheets", "GOOGLE", "ACTIVE", 0));

        mvc.perform(get("/api/v1/workspaces/connections/google/callback")
                        .param("code", "code-1")
                        .param("state", "state-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("c1"))
                .andExpect(jsonPath("$.name").value("Sheets"));
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
}
