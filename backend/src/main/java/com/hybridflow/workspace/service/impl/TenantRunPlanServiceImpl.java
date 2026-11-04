package com.hybridflow.workspace.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.support.WorkflowGraphParser;
import com.hybridflow.sync.util.FlowContextIds;
import com.hybridflow.workspace.repository.FlowContextRepository;
import com.hybridflow.workspace.service.TenantRunPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TenantRunPlanServiceImpl implements TenantRunPlanService {
    private final WorkflowGraphParser parser;
    private final FlowContextRepository contextRepository;
    private final ObjectMapper mapper;

    @Override
    public RunSyncRequest createPlan(UUID workspaceId, String workflowId, JsonNode definition, String connectionReference) {
        RunSyncRequest request = parser.buildSyncRequest(workflowId, definition, connectionReference)
                .orElseThrow(() -> new ValidationException("Cấu hình luồng chưa hợp lệ."));
        String fingerprint = request.getFlowId();
        String contextId = FlowContextIds.scoped(workspaceId, workflowId, fingerprint);
        contextRepository.ensure(workspaceId, workflowId, fingerprint, contextId);
        request.setFlowId(contextId);
        request.setWorkspaceId(workspaceId);
        request.setWorkflowId(workflowId);
        return request;
    }

    @Override
    public RunSyncRequest createPlan(UUID workspaceId, String workflowId, String definitionJson, String connectionReference) {
        try {
            JsonNode definition = mapper.readTree(definitionJson);
            return createPlan(workspaceId, workflowId, definition, connectionReference);
        } catch (Exception exception) {
            throw new ValidationException("Cấu hình luồng không đúng định dạng JSON.");
        }
    }
}
