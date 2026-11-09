package com.hybridflow.workspace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WebhookIngressResponse {
    private String status;
    private String message;
    private String executionId;
    private int rowsAppended;
    private int cellsWritten;
    private List<String> appendedKeys;
}
