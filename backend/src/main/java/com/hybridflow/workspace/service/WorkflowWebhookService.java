package com.hybridflow.workspace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.workspace.dto.request.SheetWritePreviewRequest;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;
import com.hybridflow.workspace.dto.response.WebhookIngressResponse;
import com.hybridflow.workspace.dto.response.WorkflowWebhookResponse;

import java.util.UUID;

public interface WorkflowWebhookService {

    WorkflowWebhookResponse getOrCreateWebhook(UUID workspaceId, String workflowId);

    WorkflowWebhookResponse rotateToken(UUID workspaceId, String workflowId);

    WorkflowWebhookResponse updateEnabled(UUID workspaceId, String workflowId, boolean enabled);

    SheetWritePreviewResponse previewWebhookAppend(UUID workspaceId, String workflowId, SheetWritePreviewRequest request);

    WebhookIngressResponse receive(String webhookToken, JsonNode payload);
}
