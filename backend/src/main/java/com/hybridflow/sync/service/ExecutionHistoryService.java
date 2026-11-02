package com.hybridflow.sync.service;

import java.util.List;
import java.util.Map;

public interface ExecutionHistoryService {
    String start(String flowId);
    void finish(String executionId, String status, Object result, String error);
    List<Map<String, Object>> list(String flowId);
}
