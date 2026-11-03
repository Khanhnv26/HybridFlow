package com.hybridflow.sync.scheduler;

import com.hybridflow.common.util.ErrorReporter;
import com.hybridflow.sync.service.WorkflowJobService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;

@Component @RequiredArgsConstructor
public class WorkflowScheduleRunner {
    private final WorkflowJobService jobs;
    private final ThreadPoolExecutor workflowExecutor;

    @Value("${hybridflow.scheduler.enabled:true}")
    private boolean enabled = true;

    @Scheduled(fixedDelayString = "${hybridflow.scheduler.poll-ms:5000}")
    public void pollAndExecuteDueWorkflows() {
        if (!enabled) return;
        try { jobs.enqueueDue(); }
        catch (RuntimeException exception) { ErrorReporter.report(exception); return; }
        int slots = workflowExecutor.getMaximumPoolSize() - workflowExecutor.getActiveCount();
        for (int i = 0; i < slots; i++) {
            try { workflowExecutor.execute(this::runSafely); }
            catch (RejectedExecutionException exception) { break; }
        }
    }

    private void runSafely() {
        try { jobs.runNext(); }
        catch (RuntimeException exception) { ErrorReporter.report(exception); }
    }
}
