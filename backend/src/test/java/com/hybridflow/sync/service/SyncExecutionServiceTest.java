package com.hybridflow.sync.service;

import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.engine.ThreeWayDiffEngine;
import com.hybridflow.sync.service.impl.SyncExecutionServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncExecutionServiceTest {
    @Mock GoogleSheetsService sheets;
    @Mock SheetWriteService writes;
    @Mock SyncStateService store;
    @Mock ExecutionHistoryService history;
    @Mock SyncConflictService conflicts;
    @Mock TelegramNotificationService notifications;
    @Spy ThreeWayDiffEngine engine = new ThreeWayDiffEngine();
    @InjectMocks SyncExecutionServiceImpl service;

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
        org.mockito.InOrder order = inOrder(sheets, store);
        order.verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "CANCELLED"));
        order.verify(store).saveVaultRecord("flow", "1", Map.of("id", "1", "status", "CANCELLED"));
        order.verify(store).saveSnapshot("flow", "1", Map.of("id", "1", "status", "CANCELLED"));
    }
    @Test void sheetChangesAreWrittenToVault() {
        rows("SHIPPING", "NEW");
        com.hybridflow.sync.dto.response.RunSyncResponse result = service.executeSync(request());
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
        com.hybridflow.sync.dto.response.RunSyncResponse result = service.executeSync(request);
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
        com.hybridflow.sync.dto.response.RunSyncResponse response = service.executeSync(request);
        assertTrue(response.isBootstrapRequired());
        assertEquals("AWAITING_CONFIRMATION", response.getStatus());
        verify(store, never()).saveSnapshot(anyString(), anyString(), anyMap());
        verify(store, never()).saveVaultRecord(anyString(), anyString(), anyMap());
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
    }
    @Test void notificationFailureIsReturnedInsteadOfClaimingDelivery() {
        rows("SHIPPING", "CANCELLED");
        com.hybridflow.sync.entity.SyncConflict conflict = com.hybridflow.sync.entity.SyncConflict.builder().id(9L).build();
        when(conflicts.saveConflicts(any(), any(), eq("Data"))).thenReturn(List.of(conflict));
        RunSyncRequest request = request(); request.setNotifyConflicts(true); request.setChatId("target-chat");
        com.hybridflow.sync.dto.response.RunSyncResponse result = service.executeSync(request);
        assertEquals(0, result.getNotificationsSent()); assertEquals(1, result.getNotificationsFailed());
        verify(notifications).sendConflictAlert(conflict, "target-chat");
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
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            service.executeSync(request());
            verify(history, never()).finish(any(), eq("SUCCESS"), any(), any());
            for (org.springframework.transaction.support.TransactionSynchronization callback : org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations())
                callback.afterCompletion(org.springframework.transaction.support.TransactionSynchronization.STATUS_ROLLED_BACK);
            verify(history).finish(isNull(), eq("ERROR"), isNull(), anyString());
        } finally { org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization(); }
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
                .sheets(List.of(ep1, ep2)).syncColumns(java.util.Set.of("status"))
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

        com.hybridflow.sync.entity.SyncConflict conflict = com.hybridflow.sync.entity.SyncConflict.builder().id(99L).build();
        when(conflicts.saveMultiSheetConflict(any(), any(), eq("1"), eq("status"), eq("NEW"), any(), any()))
                .thenReturn(conflict);

        RunSyncRequest request = RunSyncRequest.builder()
                .flowId("multi-flow")
                .accessToken("test-token")
                .idColumn("id")
                .sheets(List.of(ep1, ep2)).syncColumns(java.util.Set.of("status"))
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
                .sheets(List.of(ep1, ep2)).syncColumns(java.util.Set.of("status"))
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
            com.hybridflow.connector.google.dto.request.ReadSheetRequest request = inv.getArgument(0);
            return SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status", "secret"))
                    .rows(request.getSpreadsheetId().equals("a") ? List.of(Map.of("id", "1", "status", "NEW", "secret", "PRIVATE")) : List.of()).build();
        });
        RunSyncResponse result = service.executeSync(RunSyncRequest.builder().flowId("f").accessToken("test-token")
                .sheets(endpoints).syncColumns(java.util.Set.of("status")).bootstrapConfirmed(true).build());
        assertEquals("SUCCESS", result.getStatus());
        verify(writes).apply(eq("test-token"), argThat(plans -> plans.get(1).getChanges().size() == 2
                && plans.stream().flatMap(plan -> plan.getChanges().stream()).noneMatch(cell -> cell.getColumn().equals("secret"))));
        verify(store).saveSnapshot("f", "1", Map.of("id", "1", "status", "NEW"));
        org.mockito.InOrder locks = inOrder(store, sheets);
        locks.verify(store).lock("sheet:a");
        locks.verify(store).lock("sheet:b");
        locks.verify(sheets, times(2)).readSheet(any());
    }
}
