package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.sync.dto.response.SaveWorkflowResponse;

import java.util.List;
import java.util.Map;

public interface WorkflowService {
    List<Map<String, Object>> getHistory(String flowId);
    List<Map<String, String>> getVault(String flowId);
    JsonNode getDefinition(String workflowId);
    SaveWorkflowResponse saveDefinition(String workflowId, JsonNode definition);
}
