package com.hybridflow.workspace.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowWebhookRow {
    private UUID workspaceId;
    private String workflowId;
    private String webhookToken;
    private boolean enabled;
    private String lastPayloadJson;
    private Instant lastReceivedAt;
    private Instant createdAt;
}
