package com.hybridflow.notification;

import com.hybridflow.notification.service.impl.TelegramNotificationServiceImpl;
import com.hybridflow.sync.entity.SyncConflict;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class TelegramNotificationServiceTest {
    @ParameterizedTest @ValueSource(ints = {429, 403, 500})
    void detailedDeliveryPreservesRateLimitsAndClassifiesProviderFailures(int code) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TelegramNotificationServiceImpl service = new TelegramNotificationServiceImpl();
        ReflectionTestUtils.setField(service, "botToken", "test-token");
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        server.expect(requestTo("https://api.telegram.org/bottest-token/sendMessage"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("parse_mode"))))
                .andRespond(withStatus(HttpStatus.valueOf(code)).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"ok\":false,\"parameters\":{\"retry_after\":17}}"));
        com.hybridflow.notification.dto.response.TelegramDeliveryResult result = service.sendDetailedMessage("literal <text>", "123");
        assertFalse(result.isSuccess());
        assertEquals(code != 403, result.isRetryable());
        assertEquals(code == 429 ? 17 : 0, result.getRetryAfterSeconds());
        assertFalse(result.getError().contains("test-token"));
        server.verify();
    }
    @Test
    void missingCredentialsDoesNotPretendToSend() {
        assertFalse(new TelegramNotificationServiceImpl().sendMessage("test"));
    }

    @Test
    void usesConfiguredDestinationAndReportsProviderFailure() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TelegramNotificationServiceImpl service = new TelegramNotificationServiceImpl();
        ReflectionTestUtils.setField(service, "botToken", "test-token");
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        SyncConflict conflict = SyncConflict.builder().recordId("row-1").columnName("status").build();
        server.expect(requestTo("https://api.telegram.org/bottest-token/sendMessage"))
                .andExpect(method(HttpMethod.POST)).andExpect(content().string(org.hamcrest.Matchers.containsString("target-chat")))
                .andRespond(withServerError());
        assertFalse(service.sendConflictAlert(conflict, "target-chat"));
        server.verify();
    }

    @Test
    void successIsBasedOnProviderResponse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TelegramNotificationServiceImpl service = new TelegramNotificationServiceImpl();
        ReflectionTestUtils.setField(service, "botToken", "test-token");
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        server.expect(requestTo("https://api.telegram.org/bottest-token/sendMessage"))
                .andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));
        assertTrue(service.sendConflictAlert(SyncConflict.builder().recordId("row-1").build(), "target-chat"));
        server.verify();
    }
}
