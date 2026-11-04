package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.workspace.dto.request.ChangeRoleRequest;
import com.hybridflow.workspace.dto.response.MemberResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.service.MemberService;
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

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class MemberControllerTest {
    @Mock
    private MemberService service;

    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new MemberController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void listReturnsMembers() throws Exception {
        when(service.list(workspaceId)).thenReturn(List.of(
                new MemberResponse(workspaceId, userId, "user@test.com", "User", WorkspaceRole.ADMIN, Instant.now())
        ));

        mvc.perform(get("/api/v1/workspaces/" + workspaceId + "/members"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].userId").value(userId.toString()))
                .andExpect(jsonPath("$[0].email").value("user@test.com"))
                .andExpect(jsonPath("$[0].role").value("ADMIN"));
    }

    @Test
    void changeRoleReturnsOk() throws Exception {
        ChangeRoleRequest request = new ChangeRoleRequest();
        request.setRole(WorkspaceRole.EDITOR);

        mvc.perform(put("/api/v1/workspaces/" + workspaceId + "/members/" + userId + "/role")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        verify(service).changeRole(workspaceId, userId, request);
    }

    @Test
    void changeRoleWithNullRoleReturnsBadRequest() throws Exception {
        mvc.perform(put("/api/v1/workspaces/" + workspaceId + "/members/" + userId + "/role")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void removeReturnsOk() throws Exception {
        mvc.perform(delete("/api/v1/workspaces/" + workspaceId + "/members/" + userId))
                .andExpect(status().isOk());

        verify(service).remove(workspaceId, userId);
    }
}
