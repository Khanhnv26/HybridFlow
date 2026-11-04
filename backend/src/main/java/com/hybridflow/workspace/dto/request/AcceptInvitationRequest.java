package com.hybridflow.workspace.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AcceptInvitationRequest {
    @NotBlank
    @Size(min = 43, max = 43)
    private String token;
}
