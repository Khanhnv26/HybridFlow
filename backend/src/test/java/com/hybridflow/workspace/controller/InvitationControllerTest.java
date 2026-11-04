package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.workspace.dto.request.AcceptInvitationRequest;
import com.hybridflow.workspace.dto.request.InviteMemberRequest;
import com.hybridflow.workspace.dto.response.InvitationResponse;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.service.InvitationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class InvitationControllerTest {
    @Mock
    private InvitationService service;

    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID invitationId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new InvitationController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void createReturnsCreatedStatusAndInvitationUrl() throws Exception {
        InviteMemberRequest request = new InviteMemberRequest();
        request.setEmail("user@example.com");
        request.setRole(WorkspaceRole.ADMIN);

        Instant expiresAt = Instant.now();
        when(service.create(eq(workspaceId), any()))
                .thenReturn(new InvitationResponse(invitationId, "http://localhost:3000/#invite=xyz", expiresAt));

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/invitations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(invitationId.toString()))
                .andExpect(jsonPath("$.invitationUrl").value("http://localhost:3000/#invite=xyz"));
    }

    @Test
    void createWithInvalidEmailReturnsBadRequest() throws Exception {
        InviteMemberRequest request = new InviteMemberRequest();
        request.setEmail("not-an-email");
        request.setRole(WorkspaceRole.ADMIN);

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/invitations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void acceptReturnsWorkspaceResponse() throws Exception {
        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken("abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE");

        when(service.accept(any()))
                .thenReturn(new WorkspaceResponse(workspaceId, "Shop A", WorkspaceRole.ADMIN));

        mvc.perform(post("/api/v1/workspaces/invitations/accept")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(workspaceId.toString()))
                .andExpect(jsonPath("$.name").value("Shop A"))
                .andExpect(jsonPath("$.role").value("ADMIN"));
    }

    @Test
    void acceptWithInvalidTokenSizeReturnsBadRequest() throws Exception {
        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken("too-short");

        mvc.perform(post("/api/v1/workspaces/invitations/accept")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void revokeReturnsOk() throws Exception {
        mvc.perform(delete("/api/v1/workspaces/" + workspaceId + "/invitations/" + invitationId))
                .andExpect(status().isOk());

        verify(service).revoke(workspaceId, invitationId);
    }
}
