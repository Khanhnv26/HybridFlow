package com.hybridflow.common;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.common.util.ErrorClassifier;
import com.hybridflow.common.util.ErrorContext;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.CannotAcquireLockException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ErrorClassifierTest {
    @Test
    void trustedValidationIsActionableAndDatabaseOrUnexpectedDetailsArePrivate() {
        assertEquals("Chọn cột khóa.", ErrorClassifier.classify(new ValidationException("Chọn cột khóa.")).getMessage());
        for (RuntimeException exception : new RuntimeException[] {
                new IllegalArgumentException("secret-token"), new IllegalStateException("secret-token"),
                new DataIntegrityViolationException("SELECT secret-token") }) {
            assertFalse(ErrorClassifier.classify(exception).getMessage().contains("secret-token"));
        }
        assertEquals(ErrorCode.STATE_CONFLICT, ErrorClassifier.classify(new DataIntegrityViolationException("SQL")).getCode());
        assertEquals(ErrorCode.CONCURRENT_OPERATION, ErrorClassifier.classify(new CannotAcquireLockException("SQL")).getCode());
        assertTrue(ErrorClassifier.classify(new CannotAcquireLockException("SQL")).getCode().isRetryable());
        assertFalse(ErrorClassifier.classify(new NullPointerException("secret")).getCode().isRetryable());
        assertTrue(ErrorClassifier.classify(new ApplicationException(ErrorCode.RATE_LIMITED)).getCode().isRetryable());
    }

    @Test
    void nestedScopesRestoreThreadContextAndNeverExposeCauseMessages() {
        try (ErrorContext outer = ErrorContext.open("outer")) {
            try (ErrorContext inner = ErrorContext.open("inner")) {
                ErrorDetails details = ErrorClassifier.classify(new ApplicationException(ErrorCode.UPSTREAM_UNAVAILABLE,
                        "Google tạm thời chưa sẵn sàng.", new RuntimeException("https://provider/botSECRET")));
                assertEquals("inner", details.getCorrelationId());
                assertFalse(details.getMessage().contains("SECRET"));
            }
            assertEquals("outer", MDC.get(ErrorContext.KEY));
        }
        assertNull(MDC.get(ErrorContext.KEY));
    }
}
