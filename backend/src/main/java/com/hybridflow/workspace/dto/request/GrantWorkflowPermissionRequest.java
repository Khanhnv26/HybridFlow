package com.hybridflow.workspace.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GrantWorkflowPermissionRequest {
    @NotNull
    private UUID userId;
    private boolean canEdit;
    private boolean canRun;
}
