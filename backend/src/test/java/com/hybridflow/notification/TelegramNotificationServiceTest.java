package com.hybridflow.notification;

import com.hybridflow.notification.service.impl.TelegramNotificationServiceImpl;
import com.hybridflow.sync.entity.SyncConflict;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

class TelegramNotificationServiceTest {
    @Test
    void missingCredentialsDoesNotPretendToSend() {
        assertFalse(new TelegramNotificationServiceImpl().sendMessage("test"));
    }

    @Test
    void usesConfiguredDestinationAndReportsProviderFailure() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new TelegramNotificationServiceImpl();
        ReflectionTestUtils.setField(service, "botToken", "test-token");
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        var conflict = SyncConflict.builder().recordId("row-1").columnName("status").build();
        server.expect(requestTo("https://api.telegram.org/bottest-token/sendMessage"))
                .andExpect(method(HttpMethod.POST)).andExpect(content().string(org.hamcrest.Matchers.containsString("target-chat")))
                .andRespond(withServerError());
        assertFalse(service.sendConflictAlert(conflict, "target-chat"));
        server.verify();
    }

    @Test
    void successIsBasedOnProviderResponse() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new TelegramNotificationServiceImpl();
        ReflectionTestUtils.setField(service, "botToken", "test-token");
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        server.expect(requestTo("https://api.telegram.org/bottest-token/sendMessage"))
                .andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));
        assertTrue(service.sendConflictAlert(SyncConflict.builder().recordId("row-1").build(), "target-chat"));
        server.verify();
    }
}
