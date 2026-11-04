package com.hybridflow.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.notification.dto.response.TelegramLinkResponse;
import com.hybridflow.notification.dto.response.TelegramTestResponse;
import com.hybridflow.notification.client.TelegramApiClient;
import com.hybridflow.notification.service.impl.TelegramSetupServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TelegramSetupServiceTest {
    @Test void scopedTestUsesOnlyTheSelectedBot() throws Exception {
        when(client.callWithToken("selected-token", "getChat", Map.of("chat_id", "123")))
                .thenReturn(json("{\"id\":123,\"type\":\"private\",\"first_name\":\"Selected\"}"));
        when(client.callWithToken(eq("selected-token"), eq("sendMessage"), anyMap()))
                .thenReturn(json("{\"message_id\":1}"));
        assertTrue(service.sendTest("selected-token", "123", "PRIVATE").isSuccess());
        verify(client, never()).call(any(), any());
        verify(client).callWithToken(eq("selected-token"), eq("sendMessage"), anyMap());
    }

    @Test void scopedLinksRejectOtherUsersAndKeepBotUpdateCachesSeparate() throws Exception {
        when(client.callWithToken(eq("bot-a"), eq("getMe"), anyMap())).thenReturn(json("{\"username\":\"BotA\"}"));
        when(client.callWithToken(eq("bot-b"), eq("getMe"), anyMap())).thenReturn(json("{\"username\":\"BotB\"}"));
        when(client.callWithToken(any(), eq("getWebhookInfo"), anyMap())).thenReturn(json("{\"url\":\"\"}"));
        TelegramLinkResponse first = service.startLink("workspace-a:bot-a:user-a", "bot-a", "PRIVATE");
        TelegramLinkResponse second = service.startLink("workspace-b:bot-b:user-b", "bot-b", "PRIVATE");
        when(client.callWithToken(eq("bot-a"), eq("getUpdates"), anyMap())).thenReturn(update(first, "private", first.getCommand()));
        when(client.callWithToken(eq("bot-b"), eq("getUpdates"), anyMap())).thenReturn(json("[]"));
        assertEquals("CONNECTED", service.poll("workspace-a:bot-a:user-a", "bot-a", first.getId()).getStatus());
        assertThrows(com.hybridflow.common.exception.ApplicationException.class,
                () -> service.poll("workspace-a:bot-a:another-user", "bot-a", first.getId()));
        assertThrows(com.hybridflow.common.exception.ApplicationException.class,
                () -> service.poll("workspace-b:bot-b:user-b", "bot-b", first.getId()));
        assertEquals("WAITING", service.poll("workspace-b:bot-b:user-b", "bot-b", second.getId()).getStatus());
        verify(client).callWithToken(eq("bot-a"), eq("getUpdates"), anyMap());
        verify(client).callWithToken(eq("bot-b"), eq("getUpdates"), anyMap());
        verify(client, never()).call(any(), any());
    }

    @Test void missingWorkspaceTokenNeverFallsBackToGlobalBot() {
        assertThrows(com.hybridflow.common.exception.ApplicationException.class,
                () -> service.sendTest("", "123", "PRIVATE"));
        verify(client, never()).call(any(), any());
        verify(client, never()).callWithToken(any(), any(), any());
    }
    @Mock TelegramApiClient client;
    @InjectMocks TelegramSetupServiceImpl service;
    private final ObjectMapper mapper = new ObjectMapper();
    private JsonNode json(String body) throws Exception { return mapper.readTree(body); }
    private void ready() throws Exception {
        when(client.isConfigured()).thenReturn(true);
        when(client.call(eq("getMe"), anyMap())).thenReturn(json("{\"username\":\"TestBot\",\"first_name\":\"Test\",\"can_join_groups\":true}"));
        when(client.call(eq("getWebhookInfo"), anyMap())).thenReturn(json("{\"url\":\"\"}"));
    }
    private JsonNode update(TelegramLinkResponse link, String chatType, String command) throws Exception {
        return json("[{\"message\":{\"date\":" + Instant.now().getEpochSecond()
                + ",\"text\":\"" + command + "\",\"chat\":{\"id\":-10012,\"type\":\"" + chatType + "\",\"title\":\"Team\"}}}]");
    }

    @Test void missingBotConfigurationIsNotReportedAsReady() {
        assertFalse(service.botInfo().isConfigured()); verify(client, never()).call(anyString(), anyMap());
    }
    @Test void createsPrivateAndGroupLinksWithoutSendingAnyMessage() throws Exception {
        ready();
        TelegramLinkResponse personal = service.startLink("PRIVATE");
        TelegramLinkResponse group = service.startLink("GROUP");
        assertTrue(personal.getUrl().startsWith("https://t.me/TestBot?start=hf_"));
        assertTrue(group.getUrl().startsWith("https://t.me/TestBot?startgroup=hf_"));
        assertNotEquals(personal.getId(), group.getId());
        assertEquals("WAITING", group.getStatus());
        verify(client, never()).call(eq("sendMessage"), anyMap());
    }
    @Test void onlyTheMatchingOneTimeCommandCanSelectARecipient() throws Exception {
        ready(); TelegramLinkResponse link = service.startLink("GROUP");
        when(client.call(eq("getUpdates"), anyMap())).thenReturn(update(link, "supergroup", link.getCommand()));
        TelegramLinkResponse result = service.poll(link.getId());
        assertEquals("CONNECTED", result.getStatus()); assertEquals("-10012", result.getRecipient().getChatId());
        assertEquals("Team", result.getRecipient().getName());
        verify(client).call("getUpdates", Map.of("timeout", 0, "limit", 100));
        service.poll(link.getId()); verify(client, times(1)).call(eq("getUpdates"), anyMap());
    }
    @Test void unrelatedChatOrWrongCommandCannotConnect() throws Exception {
        ready(); TelegramLinkResponse link = service.startLink("PRIVATE");
        when(client.call(eq("getUpdates"), anyMap())).thenReturn(update(link, "supergroup", link.getCommand()));
        assertNull(service.poll(link.getId()).getRecipient());
        assertEquals("WAITING", service.poll(link.getId()).getStatus());
    }
    @Test void wrongPairingCodeDoesNotExposeAnotherChat() throws Exception {
        ready(); TelegramLinkResponse link = service.startLink("GROUP");
        when(client.call(eq("getUpdates"), anyMap())).thenReturn(update(link, "supergroup", "/start unrelated-code"));
        assertNull(service.poll(link.getId()).getRecipient());
    }
    @Test void existingWebhookIsNeverChangedOrDeleted() throws Exception {
        when(client.isConfigured()).thenReturn(true);
        when(client.call(eq("getMe"), anyMap())).thenReturn(json("{\"username\":\"TestBot\"}"));
        when(client.call(eq("getWebhookInfo"), anyMap())).thenReturn(json("{\"url\":\"https://another.example/hook\"}"));
        assertThrows(IllegalArgumentException.class, () -> service.startLink("PRIVATE"));
        verify(client, never()).call(eq("deleteWebhook"), anyMap());
        verify(client, never()).call(eq("setWebhook"), anyMap());
    }
    @Test void testMessageDoesNotRequireAConflict() throws Exception {
        when(client.call("getChat", Map.of("chat_id", "123"))).thenReturn(json("{\"id\":123,\"type\":\"private\",\"first_name\":\"User\"}"));
        when(client.call(eq("sendMessage"), anyMap())).thenReturn(json("{\"message_id\":1}"));
        TelegramTestResponse response = service.sendTest("123", "PRIVATE");
        assertTrue(response.isSuccess()); assertEquals("User", response.getRecipient().getName());
        verify(client).call(eq("sendMessage"), argThat(body -> "123".equals(body.get("chat_id"))));
    }
    @Test void wrongRecipientTypePreventsSending() throws Exception {
        when(client.call(eq("getChat"), anyMap())).thenReturn(json("{\"id\":123,\"type\":\"private\"}"));
        assertThrows(IllegalArgumentException.class, () -> service.sendTest("123", "GROUP"));
        verify(client, never()).call(eq("sendMessage"), anyMap());
    }
    @Test void failedTestDeliveryIsNotReportedAsSuccess() throws Exception {
        when(client.call(eq("getChat"), anyMap())).thenReturn(json("{\"id\":123,\"type\":\"private\"}"));
        when(client.call(eq("sendMessage"), anyMap())).thenThrow(new IllegalArgumentException("Bot bị chặn."));
        assertThrows(IllegalArgumentException.class, () -> service.sendTest("123", "PRIVATE"));
    }
}
