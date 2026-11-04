package com.hybridflow.workspace.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SaveModuleRequest {
    @NotBlank
    @Size(max = 120)
    private String name;

    @Size(max = 1000)
    private String description = "";

    private boolean enabled = true;
}
