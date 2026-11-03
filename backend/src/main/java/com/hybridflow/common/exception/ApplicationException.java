package com.hybridflow.common.exception;

import lombok.Getter;

@Getter
public class ApplicationException extends RuntimeException {
    private final ErrorCode errorCode;
    private final int retryAfterSeconds;

    public ApplicationException(ErrorCode errorCode) {
        this(errorCode, errorCode.getMessage(), null, 0);
    }

    public ApplicationException(ErrorCode errorCode, String message) {
        this(errorCode, message, null, 0);
    }

    public ApplicationException(ErrorCode errorCode, String message, Throwable cause) {
        this(errorCode, message, cause, 0);
    }

    public ApplicationException(ErrorCode errorCode, String message, Throwable cause, int retryAfterSeconds) {
        super(message, cause);
        this.errorCode = errorCode;
        this.retryAfterSeconds = Math.max(0, retryAfterSeconds);
    }
}
