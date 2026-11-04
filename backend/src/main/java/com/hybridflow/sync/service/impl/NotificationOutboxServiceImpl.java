package com.hybridflow.sync.service.impl;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.common.util.ErrorClassifier;
import com.hybridflow.common.util.ErrorContext;
import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.repository.NotificationOutboxRepository;
import com.hybridflow.sync.service.NotificationOutboxService;
import com.hybridflow.sync.service.NotificationSender;
import com.hybridflow.sync.service.NotificationTemplateService;
import com.hybridflow.sync.service.RuleEvaluationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class NotificationOutboxServiceImpl implements NotificationOutboxService {
    private final NotificationOutboxRepository repository;
    private final RuleEvaluationService ruleEvaluationService;
    private final NotificationTemplateService templateService;
    private final List<NotificationSender> senders;

    private static final int MAX_INDIVIDUAL_MESSAGES = 20;
    private static final int MAX_ATTEMPTS = 5;
    private static final int LEASE_SECONDS = 60;
    private static final long[] BACKOFF_SECONDS = {30, 120, 600, 1800, 3600};

    @Override
    @Transactional
    public void enqueueRecordEvents(String flowId, String executionId, List<RouterPlan> routers,
                                    List<ActionPlan> actions, List<RecordChangeEvent> events, Set<String> syncColumns) {
        enqueue(flowId, executionId, routers, actions, events, syncColumns, List.of(), List.of());
    }

    @Override
    @Transactional
    public void enqueueConflicts(String flowId, String executionId, List<ActionPlan> actions,
                                 List<String> conflictActionIds, List<SyncConflict> conflicts) {
        enqueue(flowId, executionId, List.of(), actions, List.of(), Set.of(), conflictActionIds, conflicts);
    }

    @Override
    @Transactional
    public int enqueue(String flowId, String executionId, List<RouterPlan> routers, List<ActionPlan> actions,
                       List<RecordChangeEvent> events, Set<String> syncColumns, List<String> conflictActionIds,
                       List<SyncConflict> conflicts) {
        if (actions == null || actions.isEmpty()) return 0;
        int queued = 0;
        for (ActionPlan action : actions) {
            Map<String, NotificationOutboxItem> candidates = new LinkedHashMap<>();
            if (routers != null && events != null) {
                for (RecordChangeEvent event : events) {
                    boolean matched = routers.stream().anyMatch(router -> router.getActionNodeIds() != null
                            && router.getActionNodeIds().contains(action.getNodeId())
                            && ruleEvaluationService.matches(router, event));
                    if (matched) {
                        String key = event.getRevision() == null
                                ? executionId + ":" + event.getRecordId()
                                : "revision:" + flowId.length() + ":" + flowId + ":" + event.getRecordId() + ":" + event.getRevision();
                        candidates.putIfAbsent("RECORD:" + key, item(flowId, executionId, action, "RECORD", key,
                                templateService.renderRecordMessage(action.getRecordTemplate(), event, syncColumns)));
                    }
                }
            }
            if (conflictActionIds != null && conflictActionIds.contains(action.getNodeId()) && conflicts != null) {
                for (SyncConflict conflict : conflicts) {
                    String key = String.valueOf(conflict.getId());
                    candidates.putIfAbsent("CONFLICT:" + key, item(flowId, executionId, action, "CONFLICT", key,
                            templateService.renderConflictMessage(action.getConflictTemplate(), conflict)));
                }
            }
            int individual = 0;
            int remaining = 0;
            for (NotificationOutboxItem candidate : candidates.values()) {
                if (repository.exists(action.getNodeId(), candidate.getSourceType(), candidate.getSourceKey())) continue;
                if (individual < MAX_INDIVIDUAL_MESSAGES) {
                    if (repository.enqueue(candidate)) { individual++; queued++; }
                } else {
                    // Preserve grouped source keys so open conflicts cannot be announced again next run.
                    candidate.setState("SKIPPED");
                    if (repository.enqueue(candidate)) remaining++;
                }
            }
            if (remaining > 0 && repository.enqueue(item(flowId, executionId, action, "RECORD", "summary:" + executionId,
                    "HybridFlow: Và " + remaining + " bản ghi/xung đột khác cũng cần thông báo."))) queued++;
        }
        return queued;
    }

    private NotificationOutboxItem item(String flowId, String executionId, ActionPlan action,
                                         String sourceType, String sourceKey, String message) {
        String truncated = message.codePointCount(0, message.length()) <= 4000 ? message
                : message.substring(0, message.offsetByCodePoints(0, 3997)) + "...";
        return NotificationOutboxItem.builder().flowId(flowId).executionId(executionId)
                .workspaceId(action.getWorkspaceId()).connectionId(action.getConnectionId())
                .actionNodeId(action.getNodeId()).channel(action.getChannel() == null ? "TELEGRAM" : action.getChannel())
                .destination(action.getChatId()).sourceType(sourceType).sourceKey(sourceKey)
                .message(truncated).correlationId(ErrorContext.currentId()).state("PENDING").availableAt(Instant.now()).build();
    }

    @Override
    public boolean processNext() {
        Optional<NotificationOutboxItem> claimed = repository.claim(Instant.now(), LEASE_SECONDS, MAX_ATTEMPTS);
        if (claimed.isEmpty()) return false;
        NotificationOutboxItem item = claimed.get();
        try (ErrorContext context = ErrorContext.open(item.getCorrelationId() == null ? item.getId() : item.getCorrelationId())) {
            return deliver(item);
        }
    }

    private boolean deliver(NotificationOutboxItem item) {
        Optional<NotificationSender> sender = senders.stream()
                .filter(candidate -> candidate.channel().equalsIgnoreCase(item.getChannel())).findFirst();
        if (sender.isEmpty()) {
            repository.recordFailure(item.getId(), item.getOwner(), new ErrorDetails(ErrorCode.CONFIGURATION_ERROR,
                    ErrorCode.CONFIGURATION_ERROR.getMessage(), ErrorContext.currentId(), 0));
            repository.markFailed(item.getId(), item.getOwner(), ErrorCode.CONFIGURATION_ERROR.getMessage(), Instant.now(), true);
            return true;
        }
        TelegramDeliveryResult result;
        try {
            NotificationSender notificationSender = sender.get();
            result = notificationSender.send(item);
            if (result == null) {
                result = notificationSender.send(item.getDestination(), item.getMessage());
            }
            if (result == null) {
                throw new ApplicationException(ErrorCode.INTERNAL_ERROR);
            }
        } catch (RuntimeException error) {
            ErrorDetails details = ErrorClassifier.classify(error);
            result = TelegramDeliveryResult.builder().success(false).retryable(details.getCode().isRetryable())
                    .error(details.getMessage()).errorCode(details.getCode().name()).correlationId(details.getCorrelationId())
                    .retryAfterSeconds(details.getRetryAfterSeconds()).build();
        }
        Instant now = Instant.now();
        if (!result.isSuccess()) {
            ErrorCode code = result.isRetryable() ? ErrorCode.UPSTREAM_UNAVAILABLE : ErrorCode.UPSTREAM_REJECTED;
            if (result.getErrorCode() != null) {
                try { code = ErrorCode.valueOf(result.getErrorCode()); }
                catch (IllegalArgumentException ignored) { /* Legacy sender without a known code. */ }
            }
            repository.recordFailure(item.getId(), item.getOwner(), new ErrorDetails(code, result.getError(),
                    ErrorContext.currentId(), result.getRetryAfterSeconds()));
        }
        if (result.isSuccess()) {
            repository.markSent(item.getId(), item.getOwner(), now);
        } else if (result.getRetryAfterSeconds() > 0) {
            repository.deferRateLimited(item.getId(), item.getOwner(), result.getError(), now.plusSeconds(result.getRetryAfterSeconds()));
        } else {
            boolean dead = !result.isRetryable() || item.getAttempts() >= MAX_ATTEMPTS;
            long delay = BACKOFF_SECONDS[Math.max(0, Math.min(item.getAttempts() - 1, BACKOFF_SECONDS.length - 1))];
            repository.markFailed(item.getId(), item.getOwner(), result.getError(), now.plusSeconds(delay), dead);
        }
        return true;
    }

    @Override
    public List<NotificationOutboxItem> getNotifications(String flowId, String executionId, int limit) {
        return repository.findByFlowId(flowId, executionId, Math.max(1, Math.min(limit, 500)));
    }

    @Override
    public void retry(String id) {
        if (!repository.retry(id, Instant.now())) throw new ValidationException(
                "Thông báo không còn ở trạng thái lỗi hoặc không tồn tại. Hãy tải lại danh sách.");
    }

    @Override
    public List<NotificationOutboxItem> getNotifications(String flowId, String executionId, int limit, int offset) {
        return repository.findByFlowId(flowId, executionId, Math.max(1, Math.min(limit, 500)), offset);
    }
}
