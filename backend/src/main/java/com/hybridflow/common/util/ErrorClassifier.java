package com.hybridflow.common.util;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.TransientDataAccessException;

public final class ErrorClassifier {
    private ErrorClassifier() {}

    public static ErrorDetails classify(Throwable exception) {
        ErrorCode code = ErrorCode.INTERNAL_ERROR;
        String message = code.getMessage();
        int retryAfterSeconds = 0;
        if (exception instanceof ApplicationException) {
            ApplicationException application = (ApplicationException) exception;
            code = application.getErrorCode();
            message = application.getMessage();
            retryAfterSeconds = application.getRetryAfterSeconds();
        } else if (exception instanceof ValidationException) {
            code = ErrorCode.INVALID_ARGUMENT;
            message = exception.getMessage();
        } else if (exception instanceof IllegalArgumentException) {
            code = ErrorCode.INVALID_ARGUMENT;
            message = code.getMessage();
        } else if (exception instanceof DataIntegrityViolationException) {
            code = ErrorCode.STATE_CONFLICT;
            message = code.getMessage();
        } else if (exception instanceof ConcurrencyFailureException) {
            code = ErrorCode.CONCURRENT_OPERATION;
            message = code.getMessage();
        } else if (exception instanceof DataAccessResourceFailureException || exception instanceof TransientDataAccessException) {
            code = ErrorCode.UPSTREAM_UNAVAILABLE;
            message = "Chưa truy cập được kho dữ liệu. Vui lòng thử lại sau.";
        }
        return new ErrorDetails(code, message == null || message.isBlank() ? code.getMessage() : message,
                ErrorContext.currentId(), retryAfterSeconds);
    }
}
