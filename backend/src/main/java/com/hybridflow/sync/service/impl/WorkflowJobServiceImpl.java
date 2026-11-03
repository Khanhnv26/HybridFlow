package com.hybridflow.sync.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.model.WorkflowJob;
import com.hybridflow.sync.model.ScheduledWorkflowRow;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.repository.WorkflowJobRepository;
import com.hybridflow.sync.service.*;
import com.hybridflow.sync.support.WorkflowGraphParser;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.time.Instant;

@Service @RequiredArgsConstructor
public class WorkflowJobServiceImpl implements WorkflowJobService {
    private final WorkflowDefinitionRepository definitions;
    private final WorkflowJobRepository jobs;
    private final WorkflowGraphParser parser;
    private final SyncExecutionService execution;
    private final GoogleCredentialService credentials;
    private final ObjectMapper mapper;
    private final PlatformTransactionManager transactions;
    private final Clock clock;
    @Value("${hybridflow.scheduler.lease-seconds:120}") private int leaseSeconds = 120;
    @Value("${hybridflow.scheduler.max-attempts:3}") private int maxAttempts = 3;

    @Override
    public void enqueueDue() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            Instant now = clock.instant();
            jobs.cancelObsolete(now);
            jobs.expireExhausted(now, maxAttempts);
            for (ScheduledWorkflowRow row : definitions.lockDueWorkflows(now)) {
                jobs.enqueue(row);
                definitions.advanceSchedule(row.getFlowId(), parser.computeNextRun(row.getScheduleType(), row.getIntervalMinutes(),
                        row.getDailyTime(), row.getTimezone(), now));
            }
        });
    }

    @Override
    public void runNext() {
        WorkflowJob job = new TransactionTemplate(transactions).execute(status -> jobs.claim(clock.instant(), leaseSeconds, maxAttempts).orElse(null));
        if (job == null) return;
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> execute(job));
        } catch (RuntimeException exception) {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                if (!jobs.lockOwned(job)) return;
                if (exception instanceof GoogleReconnectRequiredException) {
                    jobs.finish(job, "NEEDS_CONNECTION", "Cần kết nối lại Google.", clock.instant());
                } else if (job.getAttempts() >= maxAttempts) {
                    jobs.finish(job, "DEAD", "Đồng bộ thất bại sau số lần thử tối đa. Xem lịch sử đồng bộ.", clock.instant());
                } else {
                    jobs.retry(job, clock.instant().plusSeconds(30L * (1L << (job.getAttempts() - 1))));
                }
            });
        }
    }

    private void execute(WorkflowJob job) {
        // Held through the sync transaction: an expired lease cannot be stolen from a live worker.
        if (!jobs.lockOwned(job)) return;
        if (!definitions.isCurrent(job.getWorkflowId(), job.getRevision())) {
            jobs.finish(job, "CANCELLED", null, clock.instant());
            return;
        }
        String connection = definitions.findConnection(job.getWorkflowId()).orElseThrow(GoogleReconnectRequiredException::new);
        RunSyncRequest request;
        try {
            request = parser.buildSyncRequest(job.getWorkflowId(), mapper.readTree(job.getDefinition()), connection)
                    .orElseThrow(() -> new IllegalArgumentException("Cấu hình luồng không hợp lệ."));
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalArgumentException("Cấu hình luồng không hợp lệ.");
        }
        credentials.resolveAccessToken(connection);
        request.setScheduledExecution(true);
        RunSyncResponse result = execution.executeSync(request);
        String state = result.isBootstrapRequired() ? "NEEDS_BOOTSTRAP" : "SUCCEEDED";
        jobs.finish(job, state, result.isBootstrapRequired() ? "Chạy tay và xác nhận khởi tạo trước khi bật lịch." : null, clock.instant());
        if (!result.isBootstrapRequired()) definitions.markSuccessful(job.getWorkflowId(), clock.instant());
    }
}
