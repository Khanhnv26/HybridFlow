package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.workspace.dto.response.WebhookIngressResponse;
import com.hybridflow.workspace.service.WorkflowWebhookService;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class WebhookIngressControllerTest {

    @Mock
    private WorkflowWebhookService service;

    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new WebhookIngressController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void receive_delegatesToServiceAndReturnsOk() throws Exception {
        String token = "tok-12345";
        Map<String, Object> payload = Map.of(
                "ma_hv", "HV-2404",
                "ho_ten", "Nguyễn Minh Anh",
                "hoc_phi", "6.500.000đ"
        );

        WebhookIngressResponse response = WebhookIngressResponse.builder()
                .status("SUCCESS")
                .message("Đã thêm 1 dòng học viên mới vào bảng tính.")
                .executionId("exec-1")
                .rowsAppended(1)
                .cellsWritten(3)
                .appendedKeys(List.of("HV-2404"))
                .build();

        when(service.receive(eq(token), any())).thenReturn(response);

        mvc.perform(post("/api/v1/webhooks/{webhookToken}", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.rowsAppended").value(1))
                .andExpect(jsonPath("$.cellsWritten").value(3))
                .andExpect(jsonPath("$.appendedKeys[0]").value("HV-2404"));

        verify(service).receive(eq(token), any());
    }
}
