package com.hybridflow.common.support;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.util.ErrorClassifier;
import com.hybridflow.common.util.ErrorContext;
import jakarta.servlet.RequestDispatcher;
import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.web.servlet.error.DefaultErrorAttributes;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.WebRequest;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Safe fallback for servlet error dispatches that never reach controller advice. */
@Component
public class ApiErrorAttributes extends DefaultErrorAttributes {
    @Override
    public Map<String, Object> getErrorAttributes(WebRequest request, ErrorAttributeOptions options) {
        Object statusAttribute = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE, WebRequest.SCOPE_REQUEST);
        int status = statusAttribute instanceof Integer ? (Integer) statusAttribute : 500;
        ErrorDetails classified = ErrorClassifier.classify(getError(request));
        ErrorCode code = classified.getCode().getStatus() == status ? classified.getCode() : ErrorCode.forHttpStatus(status);
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("timestamp", Instant.now());
        attributes.put("status", status);
        attributes.put("error", status >= 500 ? "Internal Server Error" : "Request Error");
        attributes.put("code", code.name());
        attributes.put("message", code == classified.getCode() ? classified.getMessage() : code.getMessage());
        Object correlationId = request.getAttribute(ErrorContext.KEY, WebRequest.SCOPE_REQUEST);
        attributes.put("correlationId", correlationId == null ? classified.getCorrelationId() : correlationId);
        Object path = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI, WebRequest.SCOPE_REQUEST);
        attributes.put("path", path == null ? "" : path.toString());
        attributes.put("retryable", code.isRetryable());
        attributes.put("retryAfterSeconds", classified.getRetryAfterSeconds());
        attributes.put("fieldErrors", List.of());
        return attributes;
    }
}
