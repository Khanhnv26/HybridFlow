package com.hybridflow.common.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.util.List;

@Getter
@AllArgsConstructor
public class ApiError {
    private final Instant timestamp;
    private final int status;
    private final String error;
    private final String code;
    private final String message;
    private final String correlationId;
    private final String path;
    private final boolean retryable;
    private final int retryAfterSeconds;
    private final List<FieldViolation> fieldErrors;
}
