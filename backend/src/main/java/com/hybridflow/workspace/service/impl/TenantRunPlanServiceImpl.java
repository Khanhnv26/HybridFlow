package com.hybridflow.workspace.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.workspace.dto.request.ConnectionBindingItem;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.support.WorkflowGraphParser;
import com.hybridflow.sync.util.FlowContextIds;
import com.hybridflow.workspace.repository.FlowContextRepository;
import com.hybridflow.workspace.service.TenantRunPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;

@Service
@RequiredArgsConstructor
public class TenantRunPlanServiceImpl implements TenantRunPlanService {
    private final WorkflowGraphParser parser;
    private final FlowContextRepository contextRepository;
    private final ObjectMapper mapper;
    private final TenantWorkflowRepository workflows;
    private final WorkspaceConnectionRepository connections;

    @Override
    public RunSyncRequest createPlan(UUID workspaceId, String workflowId, JsonNode definition, String connectionReference) {
        return buildPlan(workspaceId, workflowId, definition, connectionReference, true);
    }

    @Override
    public RunSyncRequest createPreviewPlan(UUID workspaceId, String workflowId, JsonNode definition, String connectionReference) {
        return buildPlan(workspaceId, workflowId, definition, connectionReference, false);
    }

    private RunSyncRequest buildPlan(UUID workspaceId, String workflowId, JsonNode definition,
                                    String connectionReference, boolean ensureContext) {
        Map<String, String> bindings = new LinkedHashMap<>();
        for (ConnectionBindingItem binding : workflows.findBindings(workspaceId, workflowId)) {
            bindings.put(binding.getNodeId(), binding.getConnectionId());
        }
        String googleConnection = null;
        for (JsonNode node : definition.path("nodes")) {
            if (!"sheetsTrigger".equals(node.path("type").asText())) continue;
            String connection = bindings.get(node.path("id").asText());
            if (connection == null || connections.findGoogleConnectionId(workspaceId, connection).isEmpty()) {
                throw new ApplicationException(ErrorCode.CONNECTION_REQUIRED, "Chọn kết nối Google đang hoạt động cho từng nguồn dữ liệu.");
            }
            if (googleConnection != null && !googleConnection.equals(connection)) {
                throw new ValidationException("Các nguồn trong một luồng cần dùng cùng kết nối Google.");
            }
            googleConnection = connection;
        }
        if (googleConnection != null) connectionReference = googleConnection;
        RunSyncRequest request = parser.buildSyncRequest(workflowId, definition, connectionReference)
                .orElseThrow(() -> new ValidationException("Cấu hình luồng chưa hợp lệ."));
        String fingerprint = request.getFlowId();
        String contextId = FlowContextIds.scoped(workspaceId, workflowId, fingerprint);
        if (ensureContext) contextRepository.ensure(workspaceId, workflowId, fingerprint, contextId);
        request.setFlowId(contextId);
        request.setWorkspaceId(workspaceId);
        request.setWorkflowId(workflowId);
        for (ActionPlan action : request.getActions() == null ? List.<ActionPlan>of() : request.getActions()) {
            String connection = bindings.get(action.getNodeId());
            if (connection == null || connections.findEncryptedTelegramToken(workspaceId, connection).isEmpty()) {
                throw new ApplicationException(ErrorCode.CONNECTION_REQUIRED, "Chọn bot Telegram đang hoạt động cho từng khối gửi tin.");
            }
            action.setConnectionId(connection);
            action.setWorkspaceId(workspaceId);
        }
        return request;
    }

    @Override
    public RunSyncRequest createPlan(UUID workspaceId, String workflowId, String definitionJson, String connectionReference) {
        try {
            JsonNode definition = mapper.readTree(definitionJson);
            return createPlan(workspaceId, workflowId, definition, connectionReference);
        } catch (JsonProcessingException exception) {
            throw new ValidationException("Cấu hình luồng không đúng định dạng JSON.");
        }
    }
}
