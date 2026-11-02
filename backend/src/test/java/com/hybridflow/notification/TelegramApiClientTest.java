package com.hybridflow.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.notification.client.TelegramApiClient;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class TelegramApiClientTest {
    @Test void providerErrorsAreUsefulAndNeverExposeTheToken() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TelegramApiClient client = new TelegramApiClient(new ObjectMapper());
        ReflectionTestUtils.setField(client, "botToken", "test-token");
        ReflectionTestUtils.setField(client, "restClient", builder.build());
        server.expect(requestTo("https://api.telegram.org/bottest-token/sendMessage"))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"ok\":false,\"description\":\"bot was blocked\"}"));
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> client.call("sendMessage", Map.of()));
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
        assertThrows(IllegalArgumentException.class, () -> client.call("getChat", Map.of("chat_id", "123"))); server.verify();
    }
}
