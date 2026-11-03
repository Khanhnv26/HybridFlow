package com.hybridflow.notification.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.util.ExternalErrors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.Locale;
import java.util.Map;

@Component
public class TelegramApiClient {
    @Value("${telegram.bot.token:}")
    private String botToken;
    private final RestClient restClient;
    private final ObjectMapper mapper;

    public TelegramApiClient(ObjectMapper mapper) {
        this.mapper = mapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(15000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public boolean isConfigured() { return botToken != null && !botToken.isBlank(); }

    public JsonNode call(String method, Map<String, Object> body) {
        if (!isConfigured()) throw new ApplicationException(ErrorCode.CONFIGURATION_ERROR);
        try {
            JsonNode response = restClient.post().uri("https://api.telegram.org/bot" + botToken + "/" + method)
                    .body(body).retrieve().body(JsonNode.class);
            if (response == null || !response.path("ok").asBoolean()) {
                throw failure(response == null ? 0 : response.path("error_code").asInt(),
                        response == null ? "" : response.path("description").asText(),
                        response == null ? 30 : response.path("parameters").path("retry_after").asInt(30));
            }
            return response.path("result");
        } catch (RestClientResponseException ex) {
            String description = "";
            int retryAfter = 30;
            try {
                JsonNode response = mapper.readTree(ex.getResponseBodyAsString());
                description = response.path("description").asText();
                retryAfter = response.path("parameters").path("retry_after").asInt(30);
            }
            catch (Exception ignored) { /* Use a safe status-based message; never expose a token-bearing URL. */ }
            throw failure(ex.getStatusCode().value(), description, retryAfter);
        } catch (RestClientException ex) {
            throw new ApplicationException(ErrorCode.UPSTREAM_UNAVAILABLE);
        }
    }

    private ApplicationException failure(int code, String description, int retryAfter) {
        return ExternalErrors.telegram(code, description.toLowerCase(Locale.ROOT).contains("chat not found"), retryAfter);
    }
}
