package com.hybridflow.auth;

import com.hybridflow.auth.controller.AuthController;
import com.hybridflow.auth.dto.response.MeResponse;
import com.hybridflow.auth.service.AuthService;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerTest {
    @Test void authenticatedMeReturnsJsonWithOneIdProperty() throws Exception {
        AuthService service = mock(AuthService.class);
        UUID id = UUID.randomUUID();
        when(service.me()).thenReturn(new MeResponse(id, "user@example.test", "User"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AuthController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/api/v1/auth/me").accept("application/json, text/plain, */*"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.email").value("user@example.test"))
                .andExpect(jsonPath("$.displayName").value("User"));
    }
}
