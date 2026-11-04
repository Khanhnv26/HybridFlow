package com.hybridflow.workspace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class WorkspaceConnectionResponse {
    private final String id;
    private final String name;
    private final String provider;
    private final String state;
    private final int usageCount;
}
