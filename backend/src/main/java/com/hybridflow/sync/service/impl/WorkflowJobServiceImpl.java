package com.hybridflow.sync.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.common.util.ErrorContext;
import com.hybridflow.common.util.ErrorReporter;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.model.ScheduledWorkflowRow;
import com.hybridflow.sync.model.WorkflowJob;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.repository.WorkflowJobRepository;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.WorkflowJobService;
import com.hybridflow.sync.support.WorkflowGraphParser;
import com.hybridflow.workspace.dto.request.ConnectionBindingItem;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.TenantRunPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

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
    private final TenantWorkflowRepository tenantWorkflowRepository;
    private final WorkspaceConnectionRepository workspaceConnectionRepository;
    private final TenantRunPlanService tenantRunPlanService;
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
        try (ErrorContext context = ErrorContext.open(job.getId())) {
            runClaimed(job);
        }
    }

    private void runClaimed(WorkflowJob job) {
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> execute(job));
        } catch (RuntimeException exception) {
            ErrorDetails details = ErrorReporter.report(exception);
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                if (!jobs.lockOwned(job)) return;
                jobs.recordFailure(job, details);
                if (details.getCode() == ErrorCode.CONNECTION_REQUIRED) {
                    jobs.finish(job, "NEEDS_CONNECTION", "Cần kết nối lại Google.", clock.instant());
                } else if (!details.getCode().isRetryable() || job.getAttempts() >= maxAttempts) {
                    jobs.finish(job, "DEAD", details.getMessage(), clock.instant());
                } else {
                    jobs.retry(job, clock.instant().plusSeconds(Math.max(details.getRetryAfterSeconds(), 30L * (1L << (job.getAttempts() - 1)))), details.getMessage());
                }
            });
        }
    }

    private void execute(WorkflowJob job) {
        if (!jobs.lockOwned(job)) return;
        if (!definitions.isCurrent(job.getWorkflowId(), job.getRevision())) {
            jobs.finish(job, "CANCELLED", null, clock.instant());
            return;
        }
        if (job.getWorkspaceId() != null && !tenantWorkflowRepository.runnable(job.getWorkspaceId(), job.getWorkflowId())) {
            jobs.finish(job, "CANCELLED", null, clock.instant());
            return;
        }
        RunSyncRequest request;
        if (job.getWorkspaceId() != null) {
            String accessToken = null;
            List<ConnectionBindingItem> bindings = tenantWorkflowRepository.findBindings(job.getWorkspaceId(), job.getWorkflowId());
            for (ConnectionBindingItem b : bindings) {
                Optional<String> googleConnId = workspaceConnectionRepository.findGoogleConnectionId(job.getWorkspaceId(), b.getConnectionId());
                if (googleConnId.isPresent()) {
                    accessToken = credentials.resolveAccessToken(googleConnId.get());
                    break;
                }
            }
            if (accessToken == null) {
                String legacyConnection = definitions.findConnection(job.getWorkflowId()).orElse(null);
                if (legacyConnection != null) {
                    accessToken = credentials.resolveAccessToken(legacyConnection);
                }
            }
            request = tenantRunPlanService.createPlan(job.getWorkspaceId(), job.getWorkflowId(), job.getDefinition(), accessToken);
        } else {
            String connection = definitions.findConnection(job.getWorkflowId()).orElseThrow(GoogleReconnectRequiredException::new);
            try {
                request = parser.buildSyncRequest(job.getWorkflowId(), mapper.readTree(job.getDefinition()), connection)
                        .orElseThrow(() -> new ValidationException("Cấu hình luồng không hợp lệ."));
            } catch (JsonProcessingException exception) {
                throw new ValidationException("Cấu hình luồng không hợp lệ.");
            }
            credentials.resolveAccessToken(connection);
        }
        request.setScheduledExecution(true);
        RunSyncResponse result = execution.executeSync(request);
        String state = result.isBootstrapRequired() ? "NEEDS_BOOTSTRAP" : "SUCCEEDED";
        jobs.finish(job, state, result.isBootstrapRequired() ? "Chạy tay và xác nhận khởi tạo trước khi bật lịch." : null, clock.instant());
        if (!result.isBootstrapRequired()) definitions.markSuccessful(job.getWorkflowId(), clock.instant());
    }
}
