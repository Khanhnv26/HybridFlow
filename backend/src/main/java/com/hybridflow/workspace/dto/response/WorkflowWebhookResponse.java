package com.hybridflow.workspace.dto.response;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowWebhookResponse {
    private String webhookToken;
    private String webhookPath;
    private boolean enabled;
    private JsonNode lastPayload;
    private List<String> sampleFields;
    private Instant lastReceivedAt;
}
