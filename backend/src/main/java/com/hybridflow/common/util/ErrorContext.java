package com.hybridflow.common.util;

import org.slf4j.MDC;

import java.util.UUID;

public final class ErrorContext implements AutoCloseable {
    public static final String KEY = "correlationId";
    private final String previous;

    private ErrorContext(String correlationId) {
        previous = MDC.get(KEY);
        MDC.put(KEY, correlationId);
    }

    public static ErrorContext open(String correlationId) {
        return new ErrorContext(correlationId);
    }

    public static String currentId() {
        String current = MDC.get(KEY);
        return current == null ? UUID.randomUUID().toString() : current;
    }

    @Override
    public void close() {
        if (previous == null) MDC.remove(KEY);
        else MDC.put(KEY, previous);
    }
}
