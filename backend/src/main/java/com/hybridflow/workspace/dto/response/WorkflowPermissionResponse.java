package com.hybridflow.workspace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.UUID;

@Getter
@AllArgsConstructor
public class WorkflowPermissionResponse {
    private final UUID workspaceId;
    private final String workflowId;
    private final UUID userId;
    private final boolean canEdit;
    private final boolean canRun;
}
