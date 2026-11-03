package com.hybridflow.sync.model;

import lombok.*;

import java.time.Instant;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ParsedSchedule {
    private boolean enabled;
    private String scheduleType;
    private int intervalMinutes;
    private String dailyTime;
    private Instant nextRunAt;
    @Builder.Default
    private String timezone = "Asia/Ho_Chi_Minh";

    public static ParsedSchedule disable() {
        return ParsedSchedule.builder()
                .enabled(false)
                .scheduleType("interval")
                .intervalMinutes(5)
                .dailyTime("08:00")
                .nextRunAt(null)
                .build();
    }

}
