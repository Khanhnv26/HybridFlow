package com.hybridflow.sync.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.sync.dto.response.SaveWorkflowResponse;
import com.hybridflow.sync.service.WorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/workflows")
@RequiredArgsConstructor
public class WorkflowController {
    private final WorkflowService workflowService;

    @GetMapping("/{flowId}/history")
    public List<Map<String, Object>> history(@PathVariable String flowId) {
        return workflowService.getHistory(flowId);
    }

    @GetMapping("/{flowId}/vault")
    public List<Map<String, String>> vault(@PathVariable String flowId) {
        return workflowService.getVault(flowId);
    }

    @GetMapping("/{workflowId}/definition")
    public JsonNode definition(@PathVariable String workflowId) {
        return workflowService.getDefinition(workflowId);
    }

    @PutMapping("/{workflowId}/definition")
    public SaveWorkflowResponse save(@PathVariable String workflowId, @RequestBody JsonNode definition) {
        return workflowService.saveDefinition(workflowId, definition);
    }

    @PostMapping("/{workflowId}/run")
    public com.hybridflow.sync.dto.response.RunSyncResponse run(@PathVariable String workflowId,
            @RequestParam(defaultValue = "false") boolean bootstrapConfirmed) {
        return workflowService.runDefinition(workflowId, bootstrapConfirmed);
    }

    @GetMapping("/{workflowId}/schedule")
    public Map<String, Object> schedule(@PathVariable String workflowId) {
        return workflowService.getScheduleStatus(workflowId);
    }
}
