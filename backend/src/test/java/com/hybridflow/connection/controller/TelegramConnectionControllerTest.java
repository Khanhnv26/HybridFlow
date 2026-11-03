package com.hybridflow.connection.controller;

import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.notification.dto.response.TelegramBotInfoResponse;
import com.hybridflow.notification.dto.response.TelegramRecipientResponse;
import com.hybridflow.notification.dto.response.TelegramTestResponse;
import com.hybridflow.notification.service.TelegramSetupService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class TelegramConnectionControllerTest {
    @Mock TelegramSetupService setup;
    private MockMvc mvc;
    @BeforeEach void init() {
        mvc = MockMvcBuilders.standaloneSetup(new TelegramConnectionController(setup))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }
    @Test void botStatusDoesNotExposeToken() throws Exception {
        when(setup.botInfo()).thenReturn(new TelegramBotInfoResponse(true, "TestBot", "Test", true, "Ready"));
        mvc.perform(get("/api/v1/connections/telegram/bot")).andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("TestBot")).andExpect(jsonPath("$.token").doesNotExist());
    }
    @Test void testMessageWorksWithoutAConflictId() throws Exception {
        when(setup.sendTest("123", "PRIVATE")).thenReturn(new TelegramTestResponse(true, "Đã gửi tin thử.", new TelegramRecipientResponse("123", "Alex", "PRIVATE")));
        mvc.perform(post("/api/v1/connections/telegram/test").contentType(MediaType.APPLICATION_JSON)
                .content("{\"chatId\":\"123\",\"recipientType\":\"PRIVATE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.recipient.name").value("Alex"));
        verify(setup).sendTest("123", "PRIVATE");
    }
    @Test void sendFailureIsAnErrorResponseRatherThanSuccessText() throws Exception {
        when(setup.sendTest("123", "PRIVATE")).thenThrow(new ValidationException("Bot chưa được phép gửi tin."));
        mvc.perform(post("/api/v1/connections/telegram/test").contentType(MediaType.APPLICATION_JSON)
                .content("{\"chatId\":\"123\",\"recipientType\":\"PRIVATE\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Bot chưa được phép gửi tin."))
                .andExpect(jsonPath("$.success").doesNotExist());
    }
}
