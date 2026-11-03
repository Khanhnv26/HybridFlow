package com.hybridflow.common.exception;

import com.hybridflow.common.dto.ApiError;
import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.dto.FieldViolation;
import com.hybridflow.common.filter.CorrelationIdFilter;
import com.hybridflow.common.util.ErrorClassifier;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.time.Instant;
import java.util.List;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleApplicationException(Exception exception, HttpServletRequest request) {
        ErrorDetails details = ErrorClassifier.classify(exception);
        return response(exception, details, request.getRequestURI(), new HttpHeaders(), details.getCode().getStatus(), List.of());
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body, HttpHeaders headers,
                                                              HttpStatusCode status, WebRequest request) {
        ErrorCode code = switch (status.value()) {
            case 400 -> exception instanceof MethodArgumentNotValidException ? ErrorCode.VALIDATION_FAILED : ErrorCode.MALFORMED_REQUEST;
            case 404 -> ErrorCode.RESOURCE_NOT_FOUND;
            case 405 -> ErrorCode.METHOD_NOT_ALLOWED;
            case 406 -> ErrorCode.NOT_ACCEPTABLE;
            case 415 -> ErrorCode.UNSUPPORTED_MEDIA_TYPE;
            default -> ErrorCode.forHttpStatus(status.value());
        };
        ErrorDetails classified = ErrorClassifier.classify(exception);
        ErrorDetails details = new ErrorDetails(code, code.getMessage(), classified.getCorrelationId(), 0);
        List<FieldViolation> violations = exception instanceof MethodArgumentNotValidException
                ? ((MethodArgumentNotValidException) exception).getBindingResult().getFieldErrors().stream()
                    .map(field -> new FieldViolation(field.getField(), "Giá trị không hợp lệ.")).toList()
                : List.of();
        String path = request instanceof ServletWebRequest ? ((ServletWebRequest) request).getRequest().getRequestURI() : "";
        return response(exception, details, path, headers, status.value(), violations);
    }

    private ResponseEntity<Object> response(Exception exception, ErrorDetails details, String path, HttpHeaders original,
                                            int status, List<FieldViolation> violations) {
        HttpHeaders headers = new HttpHeaders();
        headers.putAll(original);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set(CorrelationIdFilter.HEADER, details.getCorrelationId());
        if (details.getRetryAfterSeconds() > 0) headers.set(HttpHeaders.RETRY_AFTER, String.valueOf(details.getRetryAfterSeconds()));
        HttpStatus httpStatus = HttpStatus.resolve(status);
        ApiError error = new ApiError(Instant.now(), status, httpStatus == null ? "Error" : httpStatus.getReasonPhrase(),
                details.getCode().name(), details.getMessage(), details.getCorrelationId(), path,
                details.getCode().isRetryable(), details.getRetryAfterSeconds(), violations);
        // Provider messages/causes may contain credentials or SQL. Never log them here.
        if (status >= 500) log.error("Request failed code={} correlationId={} exceptionType={}",
                details.getCode(), details.getCorrelationId(), exception.getClass().getName());
        return new ResponseEntity<>(error, headers, HttpStatusCode.valueOf(status));
    }
}
