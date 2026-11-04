package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.workspace.dto.request.SaveModuleRequest;
import com.hybridflow.workspace.dto.response.ModuleResponse;
import com.hybridflow.workspace.service.ModuleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ModuleControllerTest {
    @Mock
    private ModuleService service;

    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID moduleId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new ModuleController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void createReturnsCreatedStatus() throws Exception {
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("Finance");
        request.setDescription("Finance module");
        request.setEnabled(true);

        when(service.create(eq(workspaceId), any()))
                .thenReturn(new ModuleResponse(moduleId, workspaceId, "Finance", "Finance module", true, Instant.now()));

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/modules")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(moduleId.toString()))
                .andExpect(jsonPath("$.name").value("Finance"));
    }

    @Test
    void createWithBlankNameReturnsBadRequest() throws Exception {
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("");

        mvc.perform(post("/api/v1/workspaces/" + workspaceId + "/modules")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateReturnsUpdatedModule() throws Exception {
        SaveModuleRequest request = new SaveModuleRequest();
        request.setName("Finance 2");
        request.setDescription("Updated");
        request.setEnabled(false);

        when(service.update(eq(workspaceId), eq(moduleId), any()))
                .thenReturn(new ModuleResponse(moduleId, workspaceId, "Finance 2", "Updated", false, Instant.now()));

        mvc.perform(put("/api/v1/workspaces/" + workspaceId + "/modules/" + moduleId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(moduleId.toString()))
                .andExpect(jsonPath("$.name").value("Finance 2"));
    }

    @Test
    void listReturnsAllModules() throws Exception {
        when(service.list(workspaceId))
                .thenReturn(List.of(new ModuleResponse(moduleId, workspaceId, "Finance", "", true, Instant.now())));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/modules"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(moduleId.toString()))
                .andExpect(jsonPath("$[0].name").value("Finance"));
    }
}
