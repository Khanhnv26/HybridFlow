package com.hybridflow.sync.service;

import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.repository.SyncConflictRepository;
import com.hybridflow.sync.service.impl.SyncConflictServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncConflictServiceTest {
    @Mock SyncConflictRepository repository;
    @Mock SyncStore store;
    @Mock GoogleSheetsService sheets;
    @InjectMocks SyncConflictServiceImpl service;
    private SyncConflict conflict() { return SyncConflict.builder().id(1L).flowId("flow").spreadsheetId("sheet")
            .sheetName("Data").idColumn("id").recordId("1").columnName("status")
            .baseValue("NEW").valueA("SHIPPING").valueB("CANCELLED").status("OPEN").build(); }
    private void givenConflict(String actualSheetStatus) {
        var conflict = conflict();
        when(repository.findFlowIdById(1L)).thenReturn(Optional.of("flow"));
        when(repository.findLockedById(1L)).thenReturn(Optional.of(conflict));
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", actualSheetStatus))).build());
        when(store.read("vault_records", "flow", "1")).thenReturn(Map.of("id", "1", "status", "CANCELLED"));
        when(store.read("sync_snapshots", "flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));
    }
    @Test void resolvingWritesSheetVaultAndCheckpointBeforeMarkingResolved() {
        givenConflict("SHIPPING");
        service.resolveConflict(1L, "CANCELLED", "test-token");
        var order = inOrder(sheets, store, repository);
        order.verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "CANCELLED"));
        order.verify(store).write("vault_records", "flow", "1", Map.of("id", "1", "status", "CANCELLED"));
        order.verify(store).write("sync_snapshots", "flow", "1", Map.of("id", "1", "status", "CANCELLED"));
        order.verify(repository).save(argThat(c -> "RESOLVED".equals(c.getStatus()) && "CANCELLED".equals(c.getResolvedValue())));
    }
    @Test void providerFailureDoesNotMarkResolvedOrAdvanceCheckpoint() {
        givenConflict("SHIPPING");
        doThrow(new IllegalStateException("unavailable")).when(sheets).updateCells(anyString(), anyString(), anyMap());
        assertThrows(IllegalStateException.class, () -> service.resolveConflict(1L, "SHIPPING", "test-token"));
        verify(store, never()).write(anyString(), anyString(), anyString(), anyMap());
        verify(repository, never()).save(any());
    }
    @Test void staleDecisionIsRejectedWithoutWriting() {
        givenConflict("DELIVERED");
        assertThrows(IllegalArgumentException.class, () -> service.resolveConflict(1L, "SHIPPING", "test-token"));
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
        verify(repository, never()).save(any());
    }
    @Test void rerunningTheSameConflictReusesTheExistingId() {
        when(repository.findByFlowIdAndStatus("flow", "OPEN")).thenReturn(List.of(conflict()));
        var diff = new SyncDiffResult("1"); diff.addConflict("status", "NEW", "SHIPPING", "CANCELLED");
        var saved = service.saveConflicts(diff, RunSyncRequest.builder().flowId("flow").spreadsheetId("sheet").idColumn("id").build(), "Data");
        assertEquals(1L, saved.getFirst().getId());
        verify(repository, never()).save(any());
    }
    @Test void resolvedSourceChangesSupersedeThePreviousConflict() {
        when(repository.findByFlowIdAndStatus("flow", "OPEN")).thenReturn(List.of(conflict()));
        assertTrue(service.saveConflicts(new SyncDiffResult("1"), RunSyncRequest.builder().flowId("flow").build(), "Data").isEmpty());
        verify(repository).save(argThat(c -> "SUPERSEDED".equals(c.getStatus())));
    }
}
