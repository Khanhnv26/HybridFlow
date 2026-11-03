package com.hybridflow.sync.service;

import com.hybridflow.sync.support.WorkflowGraphParser;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class WorkflowGraphParserTest {
    private final WorkflowGraphParser parser = new WorkflowGraphParser();
    @Test void dailyTimeUsesConfiguredZoneInsteadOfJvmZone() {
        assertEquals(Instant.parse("2026-11-04T01:00:00Z"), parser.computeNextRun("daily", 5, "08:00", "Asia/Ho_Chi_Minh", Instant.parse("2026-11-03T02:00:00Z")));
        assertEquals(Instant.parse("2026-11-03T08:00:00Z"), parser.computeNextRun("daily", 5, "08:00", "UTC", Instant.parse("2026-11-03T02:00:00Z")));
    }
    @Test void dailyRunAtBoundaryMovesToTomorrow() {
        assertEquals(Instant.parse("2026-11-04T01:00:00Z"), parser.computeNextRun("daily", 5, "08:00", "Asia/Ho_Chi_Minh", Instant.parse("2026-11-03T01:00:00Z")));
    }
}
