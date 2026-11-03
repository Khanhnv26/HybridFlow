package com.hybridflow.common.dto;

import com.hybridflow.common.exception.ErrorCode;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ErrorDetails {
    private final ErrorCode code;
    private final String message;
    private final String correlationId;
    private final int retryAfterSeconds;
}
