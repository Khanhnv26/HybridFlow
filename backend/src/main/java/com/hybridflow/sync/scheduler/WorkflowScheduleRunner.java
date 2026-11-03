package com.hybridflow.sync.scheduler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.model.ScheduledWorkflowRow;
import com.hybridflow.sync.repository.WorkflowDefinitionRepository;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.support.WorkflowGraphParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowScheduleRunner {

    private final WorkflowDefinitionRepository repository;
    private final WorkflowGraphParser parser;
    private final SyncExecutionService executionService;
    private final ObjectMapper mapper;

    @Scheduled(fixedDelayString = "${hybridflow.scheduler.poll-ms:5000}")
    public void pollAndExecuteDueWorkflows() {
        LocalDateTime now = LocalDateTime.now();
        List<ScheduledWorkflowRow> dueWorkflows = repository.findDueWorkflows(now);

        for (ScheduledWorkflowRow row : dueWorkflows) {
            LocalDateTime nextRun = parser.computeNextRun(
                    row.getScheduleType(),
                    row.getIntervalMinutes(),
                    row.getDailyTime(),
                    now
            );
            repository.markScheduledRunCompleted(row.getFlowId(), now, nextRun);

            try {
                JsonNode definition = mapper.readTree(row.getDefinitionJson());
                Optional<RunSyncRequest> syncRequest = parser.buildSyncRequest(
                        row.getFlowId(),
                        definition,
                        row.getAccessToken()
                );
                if (syncRequest.isPresent()) {
                    log.info("Kích hoạt chạy định kỳ cho workflow: {}", row.getFlowId());
                    executionService.executeSync(syncRequest.get());
                }
            } catch (Exception exception) {
                log.error("Lỗi khi chạy định kỳ workflow {}: {}", row.getFlowId(), exception.getMessage(), exception);
            }
        }
    }
}
