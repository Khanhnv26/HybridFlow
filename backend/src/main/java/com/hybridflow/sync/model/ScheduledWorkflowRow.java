package com.hybridflow.sync.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ScheduledWorkflowRow {
    private String flowId;
    private UUID workspaceId;
    private UUID moduleId;
    private String definitionJson;
    private String scheduleType;
    private int intervalMinutes;
    private String dailyTime;
    private String accessToken;
    private Instant nextRunAt;
    private String timezone;
    private long revision;
}
