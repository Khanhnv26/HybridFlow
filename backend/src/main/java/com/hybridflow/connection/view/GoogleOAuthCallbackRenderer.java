package com.hybridflow.connection.view;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Component
@RequiredArgsConstructor
public class GoogleOAuthCallbackRenderer {
    private final ObjectMapper mapper;

    public String render(String accessToken, String frontendOrigin) {
        try (InputStream template = new ClassPathResource("templates/google-oauth-callback.html").getInputStream()) {
            String html = new String(template.readAllBytes(), StandardCharsets.UTF_8);
            return html.replace("{{ACCESS_TOKEN}}", scriptString(accessToken))
                    .replace("{{FRONTEND_ORIGIN}}", scriptString(frontendOrigin));
        } catch (IOException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Không thể hiển thị kết quả kết nối Google.", exception);
        }
    }

    public String renderFailure(ErrorDetails details, String frontendOrigin) {
        try (InputStream template = new ClassPathResource("templates/google-oauth-error.html").getInputStream()) {
            return new String(template.readAllBytes(), StandardCharsets.UTF_8)
                    .replace("{{ERROR_CODE}}", scriptString(details.getCode().name()))
                    .replace("{{ERROR_MESSAGE}}", scriptString(details.getMessage()))
                    .replace("{{CORRELATION_ID}}", scriptString(details.getCorrelationId()))
                    .replace("{{FRONTEND_ORIGIN}}", scriptString(frontendOrigin));
        } catch (IOException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Không thể hiển thị kết quả kết nối Google.", exception);
        }
    }

    private String scriptString(String value) throws JsonProcessingException {
        return mapper.writeValueAsString(value).replace("<", "\\u003c")
                .replace(">", "\\u003e").replace("&", "\\u0026")
                .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
    }
}
