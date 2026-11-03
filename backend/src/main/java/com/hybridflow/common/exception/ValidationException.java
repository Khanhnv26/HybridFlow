package com.hybridflow.common.exception;



/** Only application-authored, user-facing validation messages belong here. */
public class ValidationException extends IllegalArgumentException {
    public ValidationException(String message) {
        super(message);
    }

    public ValidationException(String message, Throwable cause) {
        super(message, cause);
    }
}
