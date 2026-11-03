package com.hybridflow.sync.scheduler;

import com.hybridflow.common.util.ErrorReporter;
import com.hybridflow.sync.service.NotificationOutboxService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class NotificationOutboxRunner {
    private final NotificationOutboxService outboxService;

    @Value("${hybridflow.scheduler.enabled:true}")
    private boolean enabled = true;

    @Scheduled(fixedDelayString = "${hybridflow.outbox.poll-ms:2000}")
    public void processOutbox() {
        if (!enabled) return;
        int maxPerCycle = 10;
        int processed = 0;
        try {
            while (processed < maxPerCycle && outboxService.processNext()) processed++;
        } catch (RuntimeException exception) {
            ErrorReporter.report(exception);
        }
    }
}
