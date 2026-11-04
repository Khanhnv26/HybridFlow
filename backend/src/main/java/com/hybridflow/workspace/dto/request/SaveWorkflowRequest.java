package com.hybridflow.workspace.dto.request;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SaveWorkflowRequest {
    @NotNull
    private Long expectedVersion;
    private String name;
    private UUID moduleId;
    private Boolean enabled;
    @NotNull
    private JsonNode definition;
    private List<ConnectionBindingItem> connectionBindings = new ArrayList<>();
}
