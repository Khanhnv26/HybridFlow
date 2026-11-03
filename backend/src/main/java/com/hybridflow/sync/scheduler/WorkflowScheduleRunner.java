package com.hybridflow.sync.scheduler;

import com.hybridflow.sync.service.WorkflowJobService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.RejectedExecutionException;

@Component @RequiredArgsConstructor
public class WorkflowScheduleRunner {
    private final WorkflowJobService jobs;
    private final ThreadPoolExecutor workflowExecutor;

    @Value("${hybridflow.scheduler.enabled:true}")
    private boolean enabled = true;

    @Scheduled(fixedDelayString = "${hybridflow.scheduler.poll-ms:5000}")
    public void pollAndExecuteDueWorkflows() {
        if (!enabled) return;
        jobs.enqueueDue();
        int slots = workflowExecutor.getMaximumPoolSize() - workflowExecutor.getActiveCount();
        for (int i = 0; i < slots; i++) {
            try { workflowExecutor.execute(jobs::runNext); }
            catch (RejectedExecutionException exception) { break; }
        }
    }
}
