package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.service.impl.WorkflowServiceImpl;
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
    @Mock SyncStore store;
    @Mock ExecutionHistory history;
    private final ObjectMapper mapper = new ObjectMapper();
    private WorkflowService service;

    @BeforeEach
    void setup() {
        service = new WorkflowServiceImpl(repository, mapper, store, history);
    }

    @Test
    void definitionValidationHappensBeforePersistence() throws Exception {
        JsonNode invalid = mapper.readTree("{\"nodes\":[],\"edges\":null}");
        assertThrows(IllegalArgumentException.class, () -> service.saveDefinition("workflow", invalid));
        verifyNoInteractions(repository, store);
    }

    @Test
    void validDefinitionIsSavedAndReportedAsSuccessful() throws Exception {
        String json = "{\"nodes\":[],\"edges\":[]}";
        JsonNode definition = mapper.readTree(json);
        when(store.encode(definition)).thenReturn(json);
        assertTrue(service.saveDefinition("workflow", definition).isSuccess());
        verify(repository).saveDefinition("workflow", json);
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
