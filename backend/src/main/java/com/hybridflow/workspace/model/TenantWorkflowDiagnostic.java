package com.hybridflow.workspace.model;

import java.util.UUID;

public record TenantWorkflowDiagnostic(
        boolean exists,
        String workflowName,
        boolean workflowEnabled,
        UUID moduleId,
        String moduleName,
        boolean moduleEnabled
) {
    public static TenantWorkflowDiagnostic notFound() {
        return new TenantWorkflowDiagnostic(false, null, false, null, null, false);
    }
}
