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
        service = new WorkflowServiceImpl(repository, mapper, store, history, codec, parser);
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
}
