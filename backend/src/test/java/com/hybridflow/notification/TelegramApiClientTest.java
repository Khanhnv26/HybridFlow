package com.hybridflow.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.notification.client.TelegramApiClient;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class TelegramApiClientTest {
    @Test void throttlingKeepsTheProviderDelayWithoutExposingItsBody() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TelegramApiClient client = new TelegramApiClient(new ObjectMapper());
        ReflectionTestUtils.setField(client, "botToken", "test-token");
        ReflectionTestUtils.setField(client, "restClient", builder.build());
        server.expect(requestTo("https://api.telegram.org/bottest-token/getChat"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"description\":\"private-provider-detail\",\"parameters\":{\"retry_after\":17}}"));
        ApplicationException error = assertThrows(ApplicationException.class, () -> client.call("getChat", Map.of()));
        assertEquals(ErrorCode.RATE_LIMITED, error.getErrorCode());
        assertEquals(17, error.getRetryAfterSeconds());
        assertFalse(error.getMessage().contains("private-provider-detail"));
        server.verify();
    }

    @Test void providerErrorsAreUsefulAndNeverExposeTheToken() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TelegramApiClient client = new TelegramApiClient(new ObjectMapper());
        ReflectionTestUtils.setField(client, "botToken", "test-token");
        ReflectionTestUtils.setField(client, "restClient", builder.build());
        server.expect(requestTo("https://api.telegram.org/bottest-token/sendMessage"))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"ok\":false,\"description\":\"bot was blocked\"}"));
        ApplicationException error = assertThrows(ApplicationException.class, () -> client.call("sendMessage", Map.of()));
        assertTrue(error.getMessage().contains("Start")); assertFalse(error.getMessage().contains("test-token")); server.verify();
    }
    @Test void okFalseWithHttp200IsStillAFailure() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TelegramApiClient client = new TelegramApiClient(new ObjectMapper());
        ReflectionTestUtils.setField(client, "botToken", "test-token");
        ReflectionTestUtils.setField(client, "restClient", builder.build());
        server.expect(requestTo("https://api.telegram.org/bottest-token/getChat"))
                .andRespond(withSuccess("{\"ok\":false,\"error_code\":400,\"description\":\"Bad Request: chat not found\"}", MediaType.APPLICATION_JSON));
        assertThrows(ApplicationException.class, () -> client.call("getChat", Map.of("chat_id", "123"))); server.verify();
    }
}
