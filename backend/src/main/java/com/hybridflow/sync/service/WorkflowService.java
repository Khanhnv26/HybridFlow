package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.dto.response.SaveWorkflowResponse;
import com.hybridflow.sync.model.NotificationOutboxItem;

import java.util.List;
import java.util.Map;

public interface WorkflowService {
    List<Map<String, Object>> getHistory(String flowId);
    void clearHistory(String flowId);
    List<Map<String, String>> getVault(String flowId);
    JsonNode getDefinition(String workflowId);
    SaveWorkflowResponse saveDefinition(String workflowId, JsonNode definition);
    RunSyncResponse runDefinition(String workflowId, boolean bootstrapConfirmed);
    Map<String, Object> getScheduleStatus(String workflowId);
    List<NotificationOutboxItem> getNotifications(String flowId, int limit);
    List<NotificationOutboxItem> getNotifications(String flowId, String executionId, int limit);
    List<NotificationOutboxItem> getNotifications(String flowId, String executionId, int limit, int offset);
    void retryNotification(String id);
}
