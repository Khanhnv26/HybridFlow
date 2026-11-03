package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.service.impl.WorkflowServiceImpl;
import com.hybridflow.sync.support.SyncJsonCodec;
import com.hybridflow.sync.support.WorkflowGraphParser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@ExtendWith(MockitoExtension.class)
class WorkflowServiceTest {
    @Mock WorkflowDefinitionRepository repository;
    @Mock SyncStateService store;
    @Mock ExecutionHistoryService history;
    @Mock SyncJsonCodec codec;
    @Mock NotificationOutboxService outboxService;
    private final ObjectMapper mapper = new ObjectMapper();
    private final WorkflowGraphParser parser = new WorkflowGraphParser();
    private WorkflowService service;

    @BeforeEach
    void setup() {
        service = new WorkflowServiceImpl(repository, mapper, store, history, codec, parser,
                Clock.fixed(Instant.parse("2026-11-03T02:00:00Z"), ZoneOffset.UTC),
                mock(GoogleCredentialService.class), mock(SyncExecutionService.class), outboxService);
    }

    @Test
    void definitionValidationHappensBeforePersistence() throws Exception {
        JsonNode invalid = mapper.readTree("{\"nodes\":[],\"edges\":null}");
        assertThrows(IllegalArgumentException.class, () -> service.saveDefinition("workflow", invalid));
        verifyNoInteractions(repository, store, codec);
    }

    @Test
    void validDefinitionIsSavedAndReportedAsSuccessful() throws Exception {
        String json = "{\"nodes\":[],\"edges\":[]}";
        JsonNode definition = mapper.readTree(json);
        when(codec.encode(definition)).thenReturn(json);
        assertTrue(service.saveDefinition("workflow", definition).isSuccess());
        verify(repository).saveDefinitionWithSchedule(eq("workflow"), eq(json), any(), isNull());
    }

    @Test
    void missingDefinitionReturnsAnEmptyObject() {
        when(repository.findDefinition("workflow")).thenReturn(Optional.empty());
        assertEquals(mapper.createObjectNode(), service.getDefinition("workflow"));
    }

    @Test
    void corruptStoredJsonIsReportedByTheService() {
        when(repository.findDefinition("workflow")).thenReturn(Optional.of("invalid-json"));
        assertThrows(IllegalStateException.class, () -> service.getDefinition("workflow"));
    }

    @Test
    void credentialsAreNeverStoredInOrReturnedWithTheDefinition() throws Exception {
        JsonNode definition = mapper.readTree("{\"nodes\":[],\"edges\":[],\"accessToken\":\"secret\",\"refreshToken\":\"private\"}");
        service.saveDefinition("workflow", definition);
        ArgumentCaptor<Object> encoded = ArgumentCaptor.forClass(Object.class);
        verify(codec).encode(encoded.capture());
        assertFalse(((JsonNode) encoded.getValue()).has("accessToken"));
        assertFalse(((JsonNode) encoded.getValue()).has("refreshToken"));
        when(repository.findDefinition("workflow")).thenReturn(Optional.of(definition.toString()));
        assertFalse(service.getDefinition("workflow").has("accessToken"));
    }

    @Test
    void clearHistoryValidatesFlowIdAndDelegatesToExecutionHistoryService() {
        assertThrows(IllegalArgumentException.class, () -> service.clearHistory(""));
        verifyNoInteractions(history);

        service.clearHistory("flow-1");
        verify(history).clear("flow-1");
    }

    @Test
    void notificationsQueryAndRetryDelegateToOutboxService() {
        NotificationOutboxItem item = NotificationOutboxItem.builder().id("item-1").flowId("flow-1").build();
        when(outboxService.getNotifications("flow-1", 50)).thenReturn(List.of(item));

        List<NotificationOutboxItem> result = service.getNotifications("flow-1", 50);
        assertEquals(1, result.size());
        assertEquals("item-1", result.getFirst().getId());

        service.retryNotification("item-1");
        verify(outboxService).retry("item-1");

        assertThrows(IllegalArgumentException.class, () -> service.getNotifications("", 50));
        assertThrows(IllegalArgumentException.class, () -> service.retryNotification(""));
    }
}
