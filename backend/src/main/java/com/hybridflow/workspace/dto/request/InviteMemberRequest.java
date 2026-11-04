package com.hybridflow.workspace.dto.request;

import com.hybridflow.workspace.model.WorkspaceRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class InviteMemberRequest {
    @NotBlank
    @Email
    @Size(max = 320)
    private String email;

    @NotNull
    private WorkspaceRole role;
}
