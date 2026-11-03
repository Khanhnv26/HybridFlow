package com.hybridflow.common;

import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.GlobalExceptionHandler;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.common.filter.CorrelationIdFilter;
import com.hybridflow.common.util.ErrorContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GlobalExceptionHandlerTest {
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new Fixture()).setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new CorrelationIdFilter()).build();
    }

    @Test
    void expectedFailuresKeepMessageAndCorrelationWhileUnknownFailuresHideSecrets() throws Exception {
        String correlationId = "e571b18e-b6b7-4c39-a5a0-e723225a938b";
        mvc.perform(get("/error-test").param("kind", "validation").header("X-Correlation-ID", correlationId))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Chọn cột khóa."))
                .andExpect(jsonPath("$.code").value("INVALID_ARGUMENT"))
                .andExpect(jsonPath("$.correlationId").value(correlationId)).andExpect(header().string("X-Correlation-ID", correlationId));
        mvc.perform(get("/error-test").param("kind", "unknown").param("token", "secret-value"))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.path").value("/error-test"))
                .andExpect(content().string(not(containsString("secret-value"))))
                .andExpect(content().string(not(containsString("SELECT"))))
                .andExpect(jsonPath("$.retryable").value(false));
        assertNull(MDC.get(ErrorContext.KEY));
    }

    @Test
    void frameworkFailuresUseTheSameBodyAndPreserveHttpHeaders() throws Exception {
        mvc.perform(post("/payload").contentType(MediaType.APPLICATION_JSON).content("{broken"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mvc.perform(get("/count").param("value", "secret-value"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(content().string(not(containsString("secret-value"))));
        mvc.perform(get("/count")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mvc.perform(put("/payload")).andExpect(status().isMethodNotAllowed())
                .andExpect(header().string("Allow", containsString("POST"))).andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
        mvc.perform(post("/payload").contentType(MediaType.TEXT_PLAIN).content("hello"))
                .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
        mvc.perform(get("/does-not-exist")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void rateLimitsCarryRetryAfterAndInvalidCorrelationHeadersAreReplaced() throws Exception {
        mvc.perform(get("/error-test").param("kind", "rate").header("X-Correlation-ID", "untrusted-input"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "17"))
                .andExpect(jsonPath("$.retryAfterSeconds").value(17)).andExpect(jsonPath("$.retryable").value(true))
                .andExpect(jsonPath("$.correlationId").value(not("untrusted-input")));
    }

    @RestController
    static class Fixture {
        @GetMapping("/error-test")
        public void failure(@RequestParam String kind) {
            if ("validation".equals(kind)) throw new ValidationException("Chọn cột khóa.");
            if ("rate".equals(kind)) throw new ApplicationException(ErrorCode.RATE_LIMITED, "Thử lại sau.", null, 17);
            throw new IllegalStateException("SELECT password FROM users; secret-value");
        }

        @PostMapping(value = "/payload", consumes = MediaType.APPLICATION_JSON_VALUE)
        public Map<String, Object> payload(@RequestBody Map<String, Object> value) { return value; }

        @GetMapping("/count")
        public int count(@RequestParam int value) { return value; }
    }
}
