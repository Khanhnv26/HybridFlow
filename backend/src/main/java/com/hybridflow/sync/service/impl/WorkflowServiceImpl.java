package com.hybridflow.sync.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.dto.response.SaveWorkflowResponse;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.model.ParsedSchedule;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.service.ExecutionHistoryService;
import com.hybridflow.sync.service.NotificationOutboxService;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.SyncStateService;
import com.hybridflow.sync.service.WorkflowService;
import com.hybridflow.sync.support.SyncJsonCodec;
import com.hybridflow.sync.support.WorkflowGraphParser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class WorkflowServiceImpl implements WorkflowService {
    private final WorkflowDefinitionRepository repository;
    private final ObjectMapper mapper;
    private final SyncStateService store;
    private final ExecutionHistoryService history;
    private final SyncJsonCodec codec;
    private final WorkflowGraphParser parser;
    private final Clock clock;
    private final GoogleCredentialService credentials;
    private final SyncExecutionService execution;
    private final NotificationOutboxService outboxService;

    @Override
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getHistory(String flowId) {
        validateId(flowId);
        return history.list(flowId);
    }

    @Override
    @Transactional
    public void clearHistory(String flowId) {
        validateId(flowId);
        history.clear(flowId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Map<String, String>> getVault(String flowId) {
        validateId(flowId);
        return store.getVaultRecords(flowId);
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
            return sanitize(mapper.readTree(definition.get()));
        } catch (JsonProcessingException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Không thể đọc cấu hình luồng.", exception);
        }
    }

    @Override
    @Transactional
    public SaveWorkflowResponse saveDefinition(String workflowId, JsonNode definition) {
        validateId(workflowId);
        if (definition == null || !definition.path("nodes").isArray() || !definition.path("edges").isArray()) {
            throw new ValidationException("Cấu hình luồng không hợp lệ.");
        }
        ParsedSchedule schedule = parser.extractSchedule(definition, clock.instant());
        String accessToken = definition.path("accessToken").asText(null);
        String connection = accessToken != null && accessToken.startsWith("gconn-") ? accessToken : null;
        if (schedule.isEnabled()) {
            parser.buildSyncRequest(workflowId, definition, "validation").orElseThrow(() -> new ValidationException("Cấu hình luồng chưa hợp lệ."));
            String resolved = connection != null ? connection : repository.findConnection(workflowId).orElseThrow(GoogleReconnectRequiredException::new);
            credentials.resolveAccessToken(resolved);
        }
        repository.saveDefinitionWithSchedule(workflowId, codec.encode(sanitize(definition)), schedule, connection);
        return new SaveWorkflowResponse(true);
    }

    @Override
    public RunSyncResponse runDefinition(String workflowId, boolean bootstrapConfirmed) {
        JsonNode definition = getDefinition(workflowId);
        String connection = repository.findConnection(workflowId).orElseThrow(GoogleReconnectRequiredException::new);
        credentials.resolveAccessToken(connection);
        RunSyncRequest request = parser.buildSyncRequest(workflowId, definition, connection)
                .orElseThrow(() -> new ValidationException("Cấu hình luồng chưa hợp lệ."));
        request.setBootstrapConfirmed(bootstrapConfirmed);
        RunSyncResponse response = execution.executeSync(request);
        if (!response.isBootstrapRequired()) repository.resumeAfterManualRun(workflowId);
        return response;
    }

    @Override
    public Map<String, Object> getScheduleStatus(String workflowId) {
        validateId(workflowId);
        return repository.scheduleStatus(workflowId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<NotificationOutboxItem> getNotifications(String flowId, int limit) {
        validateId(flowId);
        int max = limit <= 0 ? 50 : Math.min(limit, 200);
        return outboxService.getNotifications(flowId, max);
    }

    @Override
    @Transactional(readOnly = true)
    public List<NotificationOutboxItem> getNotifications(String flowId, String executionId, int limit) {
        validateId(flowId);
        return outboxService.getNotifications(flowId, executionId, Math.max(1, Math.min(limit, 500)));
    }

    @Override
    @Transactional(readOnly = true)
    public List<NotificationOutboxItem> getNotifications(String flowId, String executionId, int limit, int offset) {
        validateId(flowId);
        if (offset < 0) throw new ValidationException("Vị trí trang thông báo không hợp lệ.");
        return outboxService.getNotifications(flowId, executionId, Math.max(1, Math.min(limit, 500)), offset);
    }

    @Override
    @Transactional
    public void retryNotification(String id) {
        if (id == null || id.isBlank()) {
            throw new ValidationException("Mã thông báo không hợp lệ.");
        }
        outboxService.retry(id);
    }

    private JsonNode sanitize(JsonNode definition) {
        if (!definition.isObject()) throw new ValidationException("Cấu hình luồng không hợp lệ.");
        ObjectNode clean = ((ObjectNode) definition).deepCopy();
        clean.remove(List.of("accessToken", "refreshToken", "googleConnectionId"));
        return clean;
    }

    private void validateId(String id) {
        if (id == null || id.isBlank() || id.length() > 100) {
            throw new ValidationException("Mã luồng không hợp lệ.");
        }
    }
}
