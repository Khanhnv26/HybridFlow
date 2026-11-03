package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.service.impl.WorkflowServiceImpl;
import com.hybridflow.sync.support.SyncJsonCodec;
import com.hybridflow.sync.support.WorkflowGraphParser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
    private final ObjectMapper mapper = new ObjectMapper();
    private final WorkflowGraphParser parser = new WorkflowGraphParser();
    private WorkflowService service;

    @BeforeEach
    void setup() {
        service = new WorkflowServiceImpl(repository, mapper, store, history, codec, parser,
                java.time.Clock.fixed(java.time.Instant.parse("2026-11-03T02:00:00Z"), java.time.ZoneOffset.UTC),
                mock(com.hybridflow.connection.service.GoogleCredentialService.class), mock(SyncExecutionService.class));
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
        org.mockito.ArgumentCaptor<Object> encoded = org.mockito.ArgumentCaptor.forClass(Object.class);
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
}
