package com.hybridflow.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.dto.ApiError;
import com.hybridflow.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SecurityErrorWriter {
    private final ObjectMapper mapper;

    public void write(HttpServletRequest request, HttpServletResponse response,
                      ErrorCode code) throws IOException {
        String correlationId = UUID.randomUUID().toString();
        response.setStatus(code.getStatus());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("X-Correlation-ID", correlationId);
        response.setHeader("Cache-Control", "no-store");
        mapper.writeValue(response.getWriter(), new ApiError(Instant.now(), code.getStatus(),
                HttpStatus.valueOf(code.getStatus()).getReasonPhrase(), code.name(),
                code.getMessage(), correlationId, request.getRequestURI(), false, 0, List.of()));
    }
}