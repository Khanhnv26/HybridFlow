package com.hybridflow.sync.model;

import lombok.*;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ScheduledWorkflowRow {
    private String flowId;
    private String definitionJson;
    private String scheduleType;
    private int intervalMinutes;
    private String dailyTime;
    private String accessToken;
    private java.time.Instant nextRunAt;
    private String timezone;
    private long revision;
}
