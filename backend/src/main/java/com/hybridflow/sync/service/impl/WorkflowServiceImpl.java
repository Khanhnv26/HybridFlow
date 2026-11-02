package com.hybridflow.sync.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.sync.dto.response.SaveWorkflowResponse;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.service.ExecutionHistory;
import com.hybridflow.sync.service.SyncStore;
import com.hybridflow.sync.service.WorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class WorkflowServiceImpl implements WorkflowService {
    private final WorkflowDefinitionRepository repository;
    private final ObjectMapper mapper;
    private final SyncStore store;
    private final ExecutionHistory history;

    @Override
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getHistory(String flowId) {
        validateId(flowId);
        return history.list(flowId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Map<String, String>> getVault(String flowId) {
        validateId(flowId);
        return store.vault(flowId);
    }

    @Override
    @Transactional(readOnly = true)
    public JsonNode getDefinition(String workflowId) {
        validateId(workflowId);
        Optional<String> definition = repository.findDefinition(workflowId);
        if (definition.isEmpty()) {
            return mapper.createObjectNode();
        }
        try {
            return mapper.readTree(definition.get());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Không thể đọc cấu hình luồng.", exception);
        }
    }

    @Override
    @Transactional
    public SaveWorkflowResponse saveDefinition(String workflowId, JsonNode definition) {
        validateId(workflowId);
        if (definition == null || !definition.path("nodes").isArray() || !definition.path("edges").isArray()) {
            throw new IllegalArgumentException("Cấu hình luồng không hợp lệ.");
        }
        repository.saveDefinition(workflowId, store.encode(definition));
        return new SaveWorkflowResponse(true);
    }

    private void validateId(String id) {
        if (id == null || id.isBlank() || id.length() > 100) {
            throw new IllegalArgumentException("Mã luồng không hợp lệ.");
        }
    }
}
