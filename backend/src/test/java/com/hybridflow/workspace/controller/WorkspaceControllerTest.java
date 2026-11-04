package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.workspace.dto.request.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.service.WorkspaceService;
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
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class WorkspaceControllerTest {
    @Mock
    private WorkspaceService service;

    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new WorkspaceController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void createWorkspaceReturnsCreatedStatusAndBody() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.create(any())).thenReturn(new WorkspaceResponse(id, "Shop A", WorkspaceRole.OWNER));

        CreateWorkspaceRequest request = new CreateWorkspaceRequest();
        request.setName("Shop A");

        mvc.perform(post("/api/v1/workspaces")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.name").value("Shop A"))
                .andExpect(jsonPath("$.role").value("OWNER"));
    }

    @Test
    void createWorkspaceWithBlankNameFailsValidation() throws Exception {
        CreateWorkspaceRequest request = new CreateWorkspaceRequest();
        request.setName("   ");

        mvc.perform(post("/api/v1/workspaces")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void mineReturnsWorkspacesList() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.mine()).thenReturn(List.of(new WorkspaceResponse(id, "Shop A", WorkspaceRole.OWNER)));

        mvc.perform(get("/api/v1/workspaces"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id.toString()))
                .andExpect(jsonPath("$[0].name").value("Shop A"))
                .andExpect(jsonPath("$[0].role").value("OWNER"));
    }
}
