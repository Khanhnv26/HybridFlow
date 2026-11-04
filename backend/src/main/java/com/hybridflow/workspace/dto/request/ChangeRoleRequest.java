package com.hybridflow.workspace.dto.request;

import com.hybridflow.workspace.model.WorkspaceRole;
import jakarta.validation.constraints.NotNull;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@EqualsAndHashCode
public class ChangeRoleRequest {
    @NotNull
    private WorkspaceRole role;
}
