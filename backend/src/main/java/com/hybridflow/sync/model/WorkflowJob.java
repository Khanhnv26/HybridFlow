package com.hybridflow.sync.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
@AllArgsConstructor
public class WorkflowJob {
    private final String id;
    private final UUID workspaceId;
    private final String workflowId;
    private final String definition;
    private final long revision;
    private final String owner;
    private final int attempts;
}
