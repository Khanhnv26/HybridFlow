package com.hybridflow.sync.service;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.ColumnTransformConfig;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.engine.ThreeWayDiffEngine;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.service.impl.DataTransformerServiceImpl;
import com.hybridflow.sync.service.impl.SyncExecutionServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import com.hybridflow.sync.model.RecordChangeEvent;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncExecutionServiceTest {
    @Mock GoogleSheetsService sheets;
    @Mock SheetWriteService writes;
    @Mock SyncStateService store;
    @Mock ExecutionHistoryService history;
    @Mock SyncConflictService conflicts;
    @Mock TelegramNotificationService notifications;
    @Mock RuleEvaluationService ruleEvaluationService;
    @Mock NotificationTemplateService notificationTemplateService;
    @Mock NotificationOutboxService notificationOutboxService;
    @Spy ThreeWayDiffEngine engine = new ThreeWayDiffEngine();
    @Spy DataTransformerServiceImpl transformer = new DataTransformerServiceImpl();
    @InjectMocks SyncExecutionServiceImpl service;

    private RunSyncRequest eventRequest(boolean multi, boolean initial, Map<String, String> base,
                                        Map<String, String> source, Map<String, String> destination) {
        when(store.hasSnapshots("events")).thenReturn(!initial);
        when(store.getSnapshot("events", "1")).thenReturn(base);
        when(sheets.readSheet(any())).thenAnswer(call -> {
            ReadSheetRequest read = call.getArgument(0);
            Map<String, String> row = "b".equals(read.getSpreadsheetId()) ? destination : source;
            return SheetDataResponse.builder().spreadsheetId(read.getSpreadsheetId()).sheetName("Data")
                    .headers(List.of("id", "status", "note")).rows(List.of(row)).totalRows(1).build();
        });
        RunSyncRequest request = RunSyncRequest.builder().flowId("events").accessToken("token").spreadsheetId("a")
                .sheetName("Data").idColumn("id").storageName("vault").bootstrapConfirmed(initial)
                .syncColumns(Set.of("status", "note"))
                .routers(List.of(RouterPlan.builder().nodeId("r").actionNodeIds(List.of("t"))
                        .conditions(List.of(new RouterConditionItem("status", "EQUALS", "READY"))).build()))
                .actions(List.of(ActionPlan.builder().nodeId("t").chatId("123").build())).build();
        if (multi) request.setSheets(List.of(SheetEndpointRequest.builder().nodeId("a").spreadsheetId("a").sheetName("Data").build(),
                SheetEndpointRequest.builder().nodeId("b").spreadsheetId("b").sheetName("Data").build()));
        else when(store.getVaultRecord("events", "1")).thenReturn(base == null ? null : destination);
        return request;
    }

    @SuppressWarnings("unchecked")
    private List<RecordChangeEvent> capturedEvents() {
        ArgumentCaptor<List<RecordChangeEvent>> captor = ArgumentCaptor.forClass(List.class);
        verify(notificationOutboxService).enqueue(eq("events"), any(), any(), any(), captor.capture(), any(), any(), any());
        return captor.getValue();
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void partialConflictsStillEmitTheCleanCheckpointChange(boolean multi) {
        Map<String, String> base = Map.of("id", "1", "status", "NEW", "note", "old");
        RunSyncRequest request = eventRequest(multi, false, base, Map.of("id", "1", "status", "READY", "note", "A"),
                Map.of("id", "1", "status", "NEW", "note", "B"));
        if (multi) when(conflicts.saveMultiSheetConflict(any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(SyncConflict.builder().id(1L).build());
        service.executeSync(request);
        RecordChangeEvent event = capturedEvents().getFirst();
        assertEquals("UPDATED", event.getKind());
        assertEquals(Set.of("status"), event.getChangedColumns());
        assertEquals(Set.of("note"), event.getConflictedColumns());
        assertEquals("READY", event.getAfter().get("status"));
        assertEquals("old", event.getAfter().get("note"));
        verify(store).saveSnapshot("events", "1", event.getAfter());
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void unchangedRowsDoNotEmitEvents(boolean multi) {
        Map<String, String> row = Map.of("id", "1", "status", "READY", "note", "old");
        service.executeSync(eventRequest(multi, false, row, row, row));
        assertTrue(capturedEvents().isEmpty());
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void bootstrapNeverEmitsEvents(boolean multi) {
        Map<String, String> row = Map.of("id", "1", "status", "READY", "note", "old");
        service.executeSync(eventRequest(multi, true, null, row, row));
        assertTrue(capturedEvents().isEmpty());
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void aNewRowOnAnExistingFlowEmitsCreated(boolean multi) {
        Map<String, String> row = Map.of("id", "1", "status", "READY", "note", "old");
        service.executeSync(eventRequest(multi, false, null, row, row));
        RecordChangeEvent event = capturedEvents().getFirst();
        assertEquals("CREATED", event.getKind());
        assertTrue(event.getBefore().isEmpty());
        assertEquals(row, event.getAfter());
    }

    private RunSyncRequest transformRequest(boolean writeBack, boolean confirm) {
        List<ColumnTransformConfig> rules = List.of(
                new ColumnTransformConfig("id", List.of("TRIM", "UPPERCASE"), null),
                new ColumnTransformConfig("status", List.of("TRIM", "UPPERCASE"), null));
        when(sheets.readSheet(any())).thenAnswer(inv -> {
            ReadSheetRequest read = (ReadSheetRequest) inv.getArgument(0);
            boolean first = read.getSpreadsheetId().equals("a");
            return SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status"))
                    .rows(List.of(Map.of("id", first ? " sp01 " : "SP01", "status", first ? " new " : "NEW"))).build();
        });
        return RunSyncRequest.builder().flowId("transform").accessToken("token").idColumn("id")
                .sheets(List.of(SheetEndpointRequest.builder().spreadsheetId("a").sheetName("Data").transforms(rules).writeBackCleanData(writeBack).build(),
                        SheetEndpointRequest.builder().spreadsheetId("b").sheetName("Data").build()))
                .syncColumns(Set.of("status")).bootstrapConfirmed(confirm).build();
    }

    @Test void normalizedKeysAndValuesProduceZeroConflictsWithoutCleaningSourceByDefault() {
        RunSyncResponse result = service.executeSync(transformRequest(false, true));
        assertEquals("SUCCESS", result.getStatus());
        assertEquals(List.of("SP01"), result.getCleanRecordIds());
        assertTrue(result.getConflicts().isEmpty());
        verify(writes).apply(eq("token"), argThat(plans -> plans.stream().allMatch(p -> p.getChanges().isEmpty())));
        verify(conflicts, never()).saveMultiSheetConflict(any(), any(), any(), any(), any(), any(), any());
    }

    @Test void cleanupWritesUseOriginalValuesAndOriginalRecordIdentity() {
        service.executeSync(transformRequest(true, true));
        verify(writes).apply(eq("token"), argThat(plans -> plans.getFirst().getChanges().size() == 2
                && plans.getFirst().getChanges().stream().allMatch(c -> c.getRecordId().equals(" sp01 "))
                && plans.getFirst().getChanges().stream().anyMatch(c -> c.getBefore().equals(" new ") && c.getAfter().equals("NEW"))));
    }

    @Test void bootstrapPromptNeverWritesCleanup() {
        assertEquals("AWAITING_CONFIRMATION", service.executeSync(transformRequest(true, false)).getStatus());
        verify(writes, never()).apply(any(), any());
    }

    @Test void normalizedDuplicateKeysFailBeforeWriting() {
        RunSyncRequest request = transformRequest(true, true);
        reset(sheets);
        doReturn(SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status"))
                .rows(List.of(Map.of("id", " sp01 ", "status", "new"), Map.of("id", "SP01", "status", "new"))).build()).when(sheets).readSheet(any());
        assertThrows(IllegalArgumentException.class, () -> service.executeSync(request));
        verify(writes, never()).apply(any(), any());
    }

    @Test
    void rejectsMissingIdColumnInsteadOfReportingAnEmptySuccess() {
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder()
                .sheetName("Data").headers(List.of("id", "status"))
                .rows(List.of(Map.of("id", "1", "status", "NEW"))).totalRows(1).build());
        RunSyncRequest request = RunSyncRequest.builder().flowId("test-flow").accessToken("test-token")
                .spreadsheetId("test-sheet").sheetName("Data").idColumn("id (Mã đơn)")
                .bootstrapConfirmed(true).build();
        assertThrows(IllegalArgumentException.class, () -> service.executeSync(request));
    }

    private RunSyncRequest request() {
        return RunSyncRequest.builder().flowId("flow").accessToken("test-token").spreadsheetId("sheet")
                .sheetName("Data").idColumn("id").bootstrapConfirmed(true).build();
    }

    private void rows(String sourceValue, String vaultValue) {
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", sourceValue))).totalRows(1).build());
        when(store.getSnapshot("flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));
        when(store.getVaultRecord("flow", "1")).thenReturn(Map.of("id", "1", "status", vaultValue));
    }

    @Test void vaultChangesAreWrittenBackToSheetsBeforeCheckpointAdvances() {
        rows("NEW", "CANCELLED");
        service.executeSync(request());
        InOrder order = inOrder(sheets, store);
        order.verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "CANCELLED"));
        order.verify(store).saveVaultRecord("flow", "1", Map.of("id", "1", "status", "CANCELLED"));
        order.verify(store).saveSnapshot("flow", "1", Map.of("id", "1", "status", "CANCELLED"));
    }

    @Test void sheetChangesAreWrittenToVault() {
        rows("SHIPPING", "NEW");
        RunSyncResponse result = service.executeSync(request());
        verify(store).saveVaultRecord("flow", "1", Map.of("id", "1", "status", "SHIPPING"));
        assertEquals(List.of("1"), result.getCleanRecordIds());
    }

    @Test void failedSheetWriteDoesNotAdvanceCheckpointOrClaimSuccess() {
        rows("NEW", "CANCELLED");
        doThrow(new IllegalStateException("unavailable")).when(sheets).updateCells(anyString(), anyString(), anyMap());
        assertThrows(IllegalStateException.class, () -> service.executeSync(request()));
        verify(store, never()).saveSnapshot(anyString(), anyString(), anyMap());
        verify(store, never()).saveVaultRecord(anyString(), anyString(), anyMap());
        verify(history).finish(isNull(), eq("ERROR"), isNull(), anyString());
    }

    @Test void sourceWinsActuallyUpdatesTheVault() {
        rows("SHIPPING", "CANCELLED");
        RunSyncRequest request = request(); request.setConflictPolicy("SOURCE_WINS");
        RunSyncResponse result = service.executeSync(request);
        assertTrue(result.getConflicts().isEmpty());
        verify(store).saveVaultRecord("flow", "1", Map.of("id", "1", "status", "SHIPPING"));
        verify(store).saveSnapshot("flow", "1", Map.of("id", "1", "status", "SHIPPING"));
    }

    @Test void destinationWinsActuallyUpdatesSheets() {
        rows("SHIPPING", "CANCELLED");
        RunSyncRequest request = request(); request.setConflictPolicy("DESTINATION_WINS");
        service.executeSync(request);
        verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "CANCELLED"));
    }

    @Test void conflictingFieldsKeepTheOldCheckpointUntilApproved() {
        rows("SHIPPING", "CANCELLED");
        service.executeSync(request());
        verify(store).saveSnapshot("flow", "1", Map.of("id", "1", "status", "NEW"));
        verify(notifications, never()).sendConflictAlert(any(), anyString());
    }

    @Test void initialCopyNeedsExplicitConfirmation() {
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "NEW"))).build());
        RunSyncRequest request = request(); request.setBootstrapConfirmed(false);
        RunSyncResponse response = service.executeSync(request);
        assertTrue(response.isBootstrapRequired());
        assertEquals("AWAITING_CONFIRMATION", response.getStatus());
        verify(store, never()).saveSnapshot(anyString(), anyString(), anyMap());
        verify(store, never()).saveVaultRecord(anyString(), anyString(), anyMap());
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
    }

    @Test void legacyNotificationsAreQueuedInsteadOfSendingInsideTheTransaction() {
        rows("SHIPPING", "CANCELLED");
        SyncConflict conflict = SyncConflict.builder().id(9L).build();
        when(conflicts.saveConflicts(any(), any(), eq("Data"))).thenReturn(List.of(conflict));
        when(store.hasSnapshots("flow")).thenReturn(true);
        when(notificationOutboxService.enqueue(any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(1);
        RunSyncRequest request = request(); request.setBootstrapConfirmed(false); request.setNotifyConflicts(true); request.setChatId("target-chat");
        RunSyncResponse result = service.executeSync(request);
        assertEquals(0, result.getNotificationsSent()); assertEquals(0, result.getNotificationsFailed());
        assertEquals(1, result.getNotificationsQueued());
        verifyNoInteractions(notifications);
        assertEquals("target-chat", request.getActions().getFirst().getChatId());
        assertEquals(List.of(request.getActions().getFirst().getNodeId()), request.getConflictActionIds());
    }

    @Test void duplicateIdsAreRejectedBeforeAnyWrites() {
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "NEW"), Map.of("id", "1", "status", "NEW"))).build());
        assertThrows(IllegalArgumentException.class, () -> service.executeSync(request()));
        verify(store, never()).saveSnapshot(anyString(), anyString(), anyMap());
        verify(store, never()).saveVaultRecord(anyString(), anyString(), anyMap());
    }

    @Test void aCommitFailureCannotLeaveASuccessfulHistoryEntry() {
        rows("NEW", "CANCELLED");
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.executeSync(request());
            verify(history, never()).finish(any(), eq("SUCCESS"), any(), any());
            for (TransactionSynchronization callback : TransactionSynchronizationManager.getSynchronizations())
                callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            verify(history).finish(isNull(), eq("ERROR"), isNull(), anyString());
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }

    @Test
    void multiSheetSyncPropagatesSingleChangeToAllOtherSheets() {
        when(store.hasSnapshots("multi-flow")).thenReturn(true);
        when(store.getSnapshot("multi-flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));

        SheetEndpointRequest ep1 = SheetEndpointRequest.builder().nodeId("n1").spreadsheetId("s1").sheetName("Tab1").build();
        SheetEndpointRequest ep2 = SheetEndpointRequest.builder().nodeId("n2").spreadsheetId("s2").sheetName("Tab2").build();

        when(sheets.readSheet(argThat(r -> r != null && "s1".equals(r.getSpreadsheetId()))))
                .thenReturn(SheetDataResponse.builder().spreadsheetId("s1").sheetName("Tab1")
                        .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "PROCESSING"))).totalRows(1).build());

        when(sheets.readSheet(argThat(r -> r != null && "s2".equals(r.getSpreadsheetId()))))
                .thenReturn(SheetDataResponse.builder().spreadsheetId("s2").sheetName("Tab2")
                        .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "NEW"))).totalRows(1).build());

        RunSyncRequest request = RunSyncRequest.builder()
                .flowId("multi-flow")
                .accessToken("test-token")
                .idColumn("id")
                .sheets(List.of(ep1, ep2)).syncColumns(Set.of("status"))
                .bootstrapConfirmed(true)
                .build();

        RunSyncResponse response = service.executeSync(request);

        assertEquals("SUCCESS", response.getStatus());
        assertEquals(List.of("1"), response.getCleanRecordIds());
        verify(writes).apply(eq("test-token"), argThat(plans -> plans.get(0).getChanges().isEmpty()
                && plans.get(1).getChanges().getFirst().getAfter().equals("PROCESSING")));
        verify(store).saveSnapshot("multi-flow", "1", Map.of("id", "1", "status", "PROCESSING"));
    }

    @Test
    void multiSheetSyncDetectsConflictWhenMultipleSheetsChangeDifferently() {
        when(store.hasSnapshots("multi-flow")).thenReturn(true);
        when(store.getSnapshot("multi-flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));

        SheetEndpointRequest ep1 = SheetEndpointRequest.builder().nodeId("n1").spreadsheetId("s1").sheetName("Tab1").build();
        SheetEndpointRequest ep2 = SheetEndpointRequest.builder().nodeId("n2").spreadsheetId("s2").sheetName("Tab2").build();

        when(sheets.readSheet(argThat(r -> r != null && "s1".equals(r.getSpreadsheetId()))))
                .thenReturn(SheetDataResponse.builder().spreadsheetId("s1").sheetName("Tab1")
                        .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "PROCESSING"))).totalRows(1).build());

        when(sheets.readSheet(argThat(r -> r != null && "s2".equals(r.getSpreadsheetId()))))
                .thenReturn(SheetDataResponse.builder().spreadsheetId("s2").sheetName("Tab2")
                        .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "CANCELLED"))).totalRows(1).build());

        SyncConflict conflict = SyncConflict.builder().id(99L).build();
        when(conflicts.saveMultiSheetConflict(any(), any(), eq("1"), eq("status"), eq("NEW"), any(), any()))
                .thenReturn(conflict);

        RunSyncRequest request = RunSyncRequest.builder()
                .flowId("multi-flow")
                .accessToken("test-token")
                .idColumn("id")
                .sheets(List.of(ep1, ep2)).syncColumns(Set.of("status"))
                .bootstrapConfirmed(true)
                .build();

        RunSyncResponse response = service.executeSync(request);

        assertEquals("CONFLICT", response.getStatus());
        assertEquals(List.of(conflict), response.getConflicts());
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
    }

    @Test
    void multiSheetRejectsDuplicateSameSheetTarget() {
        SheetEndpointRequest ep1 = SheetEndpointRequest.builder().nodeId("n1").spreadsheetId("s1").sheetName("Tab1").build();
        SheetEndpointRequest ep2 = SheetEndpointRequest.builder().nodeId("n2").spreadsheetId("s1").sheetName("Tab1").build();

        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().spreadsheetId("s1").sheetName("Tab1")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "NEW"))).build());

        RunSyncRequest request = RunSyncRequest.builder()
                .flowId("multi-flow")
                .accessToken("test-token")
                .idColumn("id")
                .sheets(List.of(ep1, ep2)).syncColumns(Set.of("status"))
                .bootstrapConfirmed(true)
                .build();

        assertThrows(IllegalArgumentException.class, () -> service.executeSync(request));
    }

    @Test void newRowsCopyOnlyExplicitSharedColumns() {
        when(store.getSnapshot("f", "1")).thenReturn(null);
        List<SheetEndpointRequest> endpoints = List.of(
                SheetEndpointRequest.builder().spreadsheetId("a").sheetName("Data").build(),
                SheetEndpointRequest.builder().spreadsheetId("b").sheetName("Data").build());
        when(sheets.readSheet(any())).thenAnswer(inv -> {
            ReadSheetRequest request = inv.getArgument(0);
            return SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status", "secret"))
                    .rows(request.getSpreadsheetId().equals("a") ? List.of(Map.of("id", "1", "status", "NEW", "secret", "PRIVATE")) : List.of()).build();
        });
        RunSyncResponse result = service.executeSync(RunSyncRequest.builder().flowId("f").accessToken("test-token")
                .sheets(endpoints).syncColumns(Set.of("status")).bootstrapConfirmed(true).build());
        assertEquals("SUCCESS", result.getStatus());
        verify(writes).apply(eq("test-token"), argThat(plans -> plans.get(1).getChanges().size() == 2
                && plans.stream().flatMap(plan -> plan.getChanges().stream()).noneMatch(cell -> cell.getColumn().equals("secret"))));
        verify(store).saveSnapshot("f", "1", Map.of("id", "1", "status", "NEW"));
        InOrder locks = inOrder(store, sheets);
        locks.verify(store).lock("sheet:a");
        locks.verify(store).lock("sheet:b");
        locks.verify(sheets, times(2)).readSheet(any());
    }

    @Test void threeSourcesAreNormalizedIndependentlyAndOnlySelectedSourcesAreCleaned() {
        var request = transformRequest(true, true);
        var rules = request.getSheets().getFirst().getTransforms();
        var endpoints = new ArrayList<>(request.getSheets());
        endpoints.get(1).setTransforms(rules);
        endpoints.add(SheetEndpointRequest.builder().spreadsheetId("c").sheetName("Data").transforms(rules).writeBackCleanData(true).build());
        request.setSheets(endpoints);
        reset(sheets);
        when(sheets.readSheet(any())).thenAnswer(inv -> {
            ReadSheetRequest read = (ReadSheetRequest) inv.getArgument(0);
            String rawId = switch (read.getSpreadsheetId()) { case "a" -> " sp01 "; case "b" -> "SP01 "; default -> "Sp01"; };
            return SheetDataResponse.builder().spreadsheetId(read.getSpreadsheetId()).sheetName("Data").headers(List.of("id", "status"))
                    .rows(List.of(Map.of("id", rawId, "status", " new "))).build();
        });
        var result = service.executeSync(request);
        assertEquals("SUCCESS", result.getStatus());
        assertEquals(List.of("SP01"), result.getCleanRecordIds());
        assertTrue(result.getConflicts().isEmpty());
        verify(writes).apply(eq("token"), argThat(plans -> plans.size() == 3
                && plans.get(0).getChanges().size() == 2 && plans.get(1).getChanges().isEmpty() && plans.get(2).getChanges().size() == 2
                && plans.get(0).getChanges().getFirst().getRecordId().equals(" sp01 ")
                && plans.get(2).getChanges().getFirst().getRecordId().equals("Sp01")));
        verify(store).saveSnapshot("transform", "SP01", Map.of("id", "SP01", "status", "NEW"));
    }

    @Test void missingTransformColumnNamesTheSourceAndPreventsAllWrites() {
        var request = transformRequest(true, true);
        request.getSheets().get(1).setTransforms(request.getSheets().getFirst().getTransforms());
        reset(sheets);
        when(sheets.readSheet(any())).thenAnswer(inv -> {
            ReadSheetRequest read = (ReadSheetRequest) inv.getArgument(0);
            return SheetDataResponse.builder().spreadsheetId(read.getSpreadsheetId()).spreadsheetTitle("Kho " + read.getSpreadsheetId()).sheetName("Data")
                    .headers(read.getSpreadsheetId().equals("a") ? List.of("id", "status") : List.of("id"))
                    .rows(List.of(Map.of("id", "1", "status", " new "))).build();
        });
        var error = assertThrows(IllegalArgumentException.class, () -> service.executeSync(request));
        assertTrue(error.getMessage().contains("Kho b / Data"));
        assertTrue(error.getMessage().contains("status"));
        verify(writes, never()).apply(any(), any());
        verify(store, never()).saveSnapshot(any(), any(), any());
    }

    @Test
    void syncEnqueuesOutboxEventsWhenRoutersAndActionsConfigured() {
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "SHIPPING"))).totalRows(1).build());
        when(store.hasSnapshots("router-flow")).thenReturn(true);
        when(store.getSnapshot("router-flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));
        when(store.getVaultRecord("router-flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));

        RouterPlan router = RouterPlan.builder()
                .nodeId("router-1")
                .triggerOn("CHANGED")
                .matchMode("ALL")
                .conditions(List.of(new RouterConditionItem("status", "EQUALS", "SHIPPING")))
                .actionNodeIds(List.of("telegram-1"))
                .build();

        ActionPlan action = ActionPlan.builder()
                .nodeId("telegram-1")
                .channel("TELEGRAM")
                .chatId("123456")
                .recordTemplate("Đơn {id} chuyển sang {status}")
                .build();

        RunSyncRequest request = RunSyncRequest.builder()
                .flowId("router-flow")
                .accessToken("test-token")
                .spreadsheetId("sheet")
                .sheetName("Data")
                .idColumn("id")
                .bootstrapConfirmed(false)
                .routers(List.of(router))
                .actions(List.of(action))
                .build();

        when(notificationOutboxService.enqueue(any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(1);
        RunSyncResponse response = service.executeSync(request);

        assertEquals("SUCCESS", response.getStatus());
        assertEquals(1, response.getNotificationsQueued());
        verify(ruleEvaluationService).validate(eq(List.of(router)), any(), any());
        verify(notificationTemplateService).validateTemplate(eq("Đơn {id} chuyển sang {status}"), any());
        verify(notificationOutboxService).enqueue(eq("router-flow"), any(), eq(List.of(router)), eq(List.of(action)), argThat(events -> events.size() == 1 && events.getFirst().getKind().equals("UPDATED")), any(), any(), any());
    }
}
