package com.hybridflow.workspace.dto.response;

import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.UUID;

@Getter
@AllArgsConstructor
public class WorkspaceResponse {

    private final UUID id;
    private final String name;
    private final WorkspaceRole role;
}
