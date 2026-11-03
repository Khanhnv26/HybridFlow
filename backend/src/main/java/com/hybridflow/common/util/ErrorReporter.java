package com.hybridflow.common.util;

import com.hybridflow.common.dto.ErrorDetails;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public final class ErrorReporter {
    private ErrorReporter() {}

    public static ErrorDetails report(Throwable exception) {
        ErrorDetails details = ErrorClassifier.classify(exception);
        log.error("Operation failed code={} correlationId={} exceptionType={}",
                details.getCode(), details.getCorrelationId(), exception.getClass().getName());
        return details;
    }
}
