package com.hybridflow.sync.service;

import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
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
    @Mock SyncStore store;
    @Mock ExecutionHistory history;
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
        when(store.read("sync_snapshots", "flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));
        when(store.read("vault_records", "flow", "1")).thenReturn(Map.of("id", "1", "status", vaultValue));
    }
    @Test void vaultChangesAreWrittenBackToSheetsBeforeCheckpointAdvances() {
        rows("NEW", "CANCELLED");
        service.executeSync(request());
        org.mockito.InOrder order = inOrder(sheets, store);
        order.verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "CANCELLED"));
        order.verify(store).write("vault_records", "flow", "1", Map.of("id", "1", "status", "CANCELLED"));
        order.verify(store).write("sync_snapshots", "flow", "1", Map.of("id", "1", "status", "CANCELLED"));
    }
    @Test void sheetChangesAreWrittenToVault() {
        rows("SHIPPING", "NEW");
        com.hybridflow.sync.dto.response.RunSyncResponse result = service.executeSync(request());
        verify(store).write("vault_records", "flow", "1", Map.of("id", "1", "status", "SHIPPING"));
        assertEquals(List.of("1"), result.getCleanRecordIds());
    }
    @Test void failedSheetWriteDoesNotAdvanceCheckpointOrClaimSuccess() {
        rows("NEW", "CANCELLED");
        doThrow(new IllegalStateException("unavailable")).when(sheets).updateCells(anyString(), anyString(), anyMap());
        assertThrows(IllegalStateException.class, () -> service.executeSync(request()));
        verify(store, never()).write(anyString(), anyString(), anyString(), anyMap());
        verify(history).finish(isNull(), eq("ERROR"), isNull(), anyString());
    }
    @Test void sourceWinsActuallyUpdatesTheVault() {
        rows("SHIPPING", "CANCELLED");
        RunSyncRequest request = request(); request.setConflictPolicy("SOURCE_WINS");
        com.hybridflow.sync.dto.response.RunSyncResponse result = service.executeSync(request);
        assertTrue(result.getConflicts().isEmpty());
        verify(store).write("vault_records", "flow", "1", Map.of("id", "1", "status", "SHIPPING"));
        verify(store).write("sync_snapshots", "flow", "1", Map.of("id", "1", "status", "SHIPPING"));
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
        verify(store).write("sync_snapshots", "flow", "1", Map.of("id", "1", "status", "NEW"));
        verify(notifications, never()).sendConflictAlert(any(), anyString());
    }
    @Test void initialCopyNeedsExplicitConfirmation() {
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", "NEW"))).build());
        RunSyncRequest request = request(); request.setBootstrapConfirmed(false);
        com.hybridflow.sync.dto.response.RunSyncResponse response = service.executeSync(request);
        assertTrue(response.isBootstrapRequired());
        assertEquals("AWAITING_CONFIRMATION", response.getStatus());
        verify(store, never()).write(anyString(), anyString(), anyString(), anyMap());
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
        verify(store, never()).write(anyString(), anyString(), anyString(), anyMap());
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
}
