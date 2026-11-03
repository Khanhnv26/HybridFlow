package com.hybridflow.sync.model;

import lombok.*;

import java.time.LocalDateTime;

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
    private LocalDateTime nextRunAt;

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
