package com.hybridflow.sync.service;

import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.repository.NotificationOutboxRepository;
import com.hybridflow.sync.scheduler.NotificationOutboxRunner;
import com.hybridflow.sync.service.impl.NotificationOutboxServiceImpl;
import com.hybridflow.sync.service.impl.NotificationTemplateServiceImpl;
import com.hybridflow.sync.service.impl.RuleEvaluationServiceImpl;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationOutboxServiceTest {
    private final NotificationOutboxRepository repository = mock(NotificationOutboxRepository.class);
    private final NotificationSender sender = mock(NotificationSender.class);
    private final NotificationOutboxServiceImpl service = new NotificationOutboxServiceImpl(repository,
            new RuleEvaluationServiceImpl(), new NotificationTemplateServiceImpl(), List.of(sender));

    private RouterPlan router(String id) {
        return RouterPlan.builder().nodeId(id).actionNodeIds(List.of("a"))
                .conditions(List.of(new RouterConditionItem("status", "EQUALS", "READY"))).build();
    }

    private ActionPlan action() { return ActionPlan.builder().nodeId("a").chatId("123").recordTemplate("{id}:{status}").build(); }

    private List<RecordChangeEvent> events(int count) {
        return IntStream.range(0, count).mapToObj(id -> RecordChangeEvent.builder().recordId("" + id).kind("UPDATED")
                .before(Map.of("status", "NEW")).after(Map.of("id", "" + id, "status", "READY")).build()).toList();
    }

    private List<NotificationOutboxItem> captureEnqueues() {
        List<NotificationOutboxItem> items = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        when(repository.exists(anyString(), anyString(), anyString())).thenAnswer(call ->
                keys.contains(call.getArgument(0) + ":" + call.getArgument(1) + ":" + call.getArgument(2)));
        when(repository.enqueue(any())).thenAnswer(call -> {
            NotificationOutboxItem item = call.getArgument(0);
            if (!keys.add(item.getActionNodeId() + ":" + item.getSourceType() + ":" + item.getSourceKey())) return false;
            items.add(item); return true;
        });
        return items;
    }

    @Test void queuedNotificationsRetainWorkspaceAndSelectedBot() {
        List<NotificationOutboxItem> items = captureEnqueues();
        UUID workspace = UUID.randomUUID();
        ActionPlan selected = action();
        selected.setWorkspaceId(workspace);
        selected.setConnectionId("selected-bot");
        assertEquals(1, service.enqueue("flow", "run", List.of(router("r")), List.of(selected),
                events(1), Set.of("id", "status"), List.of(), List.of()));
        assertEquals(workspace, items.getFirst().getWorkspaceId());
        assertEquals("selected-bot", items.getFirst().getConnectionId());
    }

    @Test void revisionsDeduplicateAcrossExecutionsButAllowLaterChangesAndOtherFlows() {
        List<NotificationOutboxItem> items = captureEnqueues();
        RecordChangeEvent change = events(1).getFirst();
        change.setRevision(2L);
        assertEquals(1, service.enqueue("flow", "run-1", List.of(router("r")), List.of(action()),
                List.of(change), Set.of("id", "status"), List.of(), List.of()));
        assertEquals(0, service.enqueue("flow", "run-2", List.of(router("r")), List.of(action()),
                List.of(change), Set.of("id", "status"), List.of(), List.of()));
        // The same value after an intervening update is a new revision, not a duplicate.
        change.setRevision(4L);
        assertEquals(1, service.enqueue("flow", "run-3", List.of(router("r")), List.of(action()),
                List.of(change), Set.of("id", "status"), List.of(), List.of()));
        assertEquals(1, service.enqueue("other-flow", "run-4", List.of(router("r")), List.of(action()),
                List.of(change), Set.of("id", "status"), List.of(), List.of()));
        assertEquals(3, items.size());
    }

    @Test void deduplicatesBeforeApplyingTheLimitAndRendersPerDestination() {
        List<NotificationOutboxItem> items = captureEnqueues();
        ActionPlan second = ActionPlan.builder().nodeId("b").chatId("456").recordTemplate("Manager {id}").build();
        RouterPlan router = router("r1"); router.setActionNodeIds(List.of("a", "b"));
        assertEquals(30, service.enqueue("flow", "run", List.of(router, router("r2")), List.of(action(), second), events(15), Set.of("id", "status"), List.of(), List.of()));
        assertEquals(15, items.stream().filter(item -> item.getDestination().equals("123")).count());
        assertEquals(15, items.stream().filter(item -> item.getDestination().equals("456") && item.getMessage().startsWith("Manager ")).count());
        assertEquals(0, service.enqueue("flow", "run", List.of(router), List.of(action(), second), events(15), Set.of("id", "status"), List.of(), List.of()));
    }

    @Test void groupsOneHundredRecordsAfterDeduplication() {
        List<NotificationOutboxItem> items = captureEnqueues();
        assertEquals(21, service.enqueue("flow", "run", List.of(router("r1"), router("r2")), List.of(action()), events(100), Set.of("id", "status"), List.of(), List.of()));
        assertEquals(21, items.stream().filter(item -> item.getState().equals("PENDING")).count());
        assertEquals(80, items.stream().filter(item -> item.getState().equals("SKIPPED")).count());
        assertTrue(items.getLast().getMessage().contains("80"));
    }

    @Test void sharesLimitAcrossRecordsAndConflictsAndKeepsGroupedConflictsDeduplicatedNextRun() {
        List<NotificationOutboxItem> items = captureEnqueues();
        List<SyncConflict> conflicts = IntStream.range(0, 10).mapToObj(id -> SyncConflict.builder().id((long) id).recordId("r" + id).build()).toList();
        assertEquals(21, service.enqueue("flow", "run", List.of(router("r1")), List.of(action()), events(15), Set.of("id", "status"), List.of("a"), conflicts));
        assertTrue(items.getLast().getMessage().contains("5"));
        assertEquals(0, service.enqueue("flow", "next-run", List.of(), List.of(action()), List.of(), Set.of(), List.of("a"), conflicts));
    }

    @Test void unmatchedRecordsDoNotIncreaseQueuedCount() {
        assertEquals(0, service.enqueue("flow", "run", List.of(router("r1")), List.of(action()),
                List.of(RecordChangeEvent.builder().recordId("1").kind("UPDATED").after(Map.of("status", "NEW")).build()), Set.of("status"), List.of(), List.of()));
        verify(repository, never()).enqueue(any());
    }

    private void claimed(int attempts, TelegramDeliveryResult result) {
        NotificationOutboxItem item = NotificationOutboxItem.builder().id("n").owner("o").channel("TELEGRAM")
                .destination("123").message("stored rendered message").attempts(attempts).build();
        when(repository.claim(any(), eq(60), eq(5))).thenReturn(Optional.of(item));
        when(sender.channel()).thenReturn("TELEGRAM");
        when(sender.send("123", "stored rendered message")).thenReturn(result);
    }

    @Test void rateLimitingNeverExhaustsAttemptsAndWaitsFromTheResponseTime() {
        claimed(5, TelegramDeliveryResult.builder().retryable(true).retryAfterSeconds(17).error("429").build());
        Instant before = Instant.now();
        assertTrue(service.processNext());
        ArgumentCaptor<Instant> next = ArgumentCaptor.forClass(Instant.class);
        verify(repository).deferRateLimited(eq("n"), eq("o"), eq("429"), next.capture());
        assertFalse(next.getValue().isBefore(before.plusSeconds(17)));
        verify(repository, never()).markFailed(any(), any(), any(), any(), anyBoolean());
    }

    @Test void retriesServerErrorsAndMakesTheFifthFailureDead() {
        claimed(1, TelegramDeliveryResult.builder().retryable(true).error("500").build());
        Instant before = Instant.now(); service.processNext();
        verify(repository).markFailed(eq("n"), eq("o"), eq("500"), argThat(time -> !time.isBefore(before.plusSeconds(30))), eq(false));
        reset(repository);
        claimed(5, TelegramDeliveryResult.builder().retryable(true).error("500").build());
        service.processNext();
        verify(repository).markFailed(eq("n"), eq("o"), eq("500"), any(), eq(true));
    }

    @Test void permanentErrorsDieImmediatelyAndSuccessMarksSent() {
        claimed(1, TelegramDeliveryResult.builder().retryable(false).error("403").build());
        service.processNext(); verify(repository).markFailed(eq("n"), eq("o"), eq("403"), any(), eq(true));
        reset(repository);
        claimed(1, TelegramDeliveryResult.builder().success(true).build());
        service.processNext(); verify(repository).markSent(eq("n"), eq("o"), any());
    }

    @Test void conflictVariablesValidateAndRenderUsingTheSameContractWithoutRecursiveSubstitution() {
        NotificationTemplateService templates = new NotificationTemplateServiceImpl();
        String template = "{ recordId }/{columnName}/{valueA}/{valueB}";
        assertDoesNotThrow(() -> templates.validateConflictTemplate(template));
        assertEquals("1/status/{valueB}/B", templates.renderConflictMessage(template,
                SyncConflict.builder().recordId("1").columnName("status").valueA("{valueB}").valueB("B").build()));
        assertThrows(IllegalArgumentException.class, () -> templates.validateConflictTemplate("{status}"));
    }

    @Test void oneBlockedDestinationDoesNotStopTheNextDestinationInTheWorkerBatch() {
        NotificationOutboxItem blocked = NotificationOutboxItem.builder().id("blocked").owner("o1").channel("TELEGRAM")
                .destination("bad").message("first").attempts(1).build();
        NotificationOutboxItem healthy = NotificationOutboxItem.builder().id("healthy").owner("o2").channel("TELEGRAM")
                .destination("good").message("second").attempts(1).build();
        when(repository.claim(any(), eq(60), eq(5))).thenReturn(Optional.of(blocked), Optional.of(healthy), Optional.empty());
        when(sender.channel()).thenReturn("TELEGRAM");
        when(sender.send("bad", "first")).thenReturn(TelegramDeliveryResult.builder().retryable(false).error("403").build());
        when(sender.send("good", "second")).thenReturn(TelegramDeliveryResult.builder().success(true).build());
        new NotificationOutboxRunner(service).processOutbox();
        verify(repository).markFailed(eq("blocked"), eq("o1"), eq("403"), any(), eq(true));
        verify(repository).markSent(eq("healthy"), eq("o2"), any());
    }
}
