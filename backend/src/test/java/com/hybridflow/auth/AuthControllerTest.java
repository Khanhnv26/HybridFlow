package com.hybridflow.auth;

import com.hybridflow.auth.controller.AuthController;
import com.hybridflow.auth.dto.response.MeResponse;
import com.hybridflow.auth.repository.AccountRepository;
import com.hybridflow.auth.service.impl.AuthServiceImpl;
import com.hybridflow.auth.service.impl.CurrentUserServiceImpl;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerTest {
    @Test void authenticatedMeReturnsJsonWithOneIdProperty() throws Exception {
        AccountRepository accounts = mock(AccountRepository.class);
        OidcUser principal = mock(OidcUser.class);
        UUID id = UUID.randomUUID();
        String avatarUrl = "https://lh3.googleusercontent.com/avatar";
        when(principal.getSubject()).thenReturn("google-subject");
        when(principal.getPicture()).thenReturn(avatarUrl);
        when(accounts.findBySubject("google-subject"))
                .thenReturn(Optional.of(new MeResponse(id, "user@example.test", "User")));
        var service = new AuthServiceImpl(new CurrentUserServiceImpl(accounts));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AuthController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(principal, null));
        try {
            mvc.perform(get("/api/v1/auth/me").accept("application/json, text/plain, */*"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(id.toString()))
                    .andExpect(jsonPath("$.email").value("user@example.test"))
                    .andExpect(jsonPath("$.displayName").value("User"))
                    .andExpect(jsonPath("$.avatarUrl").value(avatarUrl));
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
