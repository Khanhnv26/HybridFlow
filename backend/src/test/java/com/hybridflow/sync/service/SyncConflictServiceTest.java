package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.repository.SyncConflictRepository;
import com.hybridflow.sync.service.impl.SyncConflictServiceImpl;
import com.hybridflow.sync.support.SyncJsonCodec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncConflictServiceTest {
    @Mock SyncConflictRepository repository;
    @Mock SyncStateService store;
    @Mock GoogleSheetsService sheets;
    @Mock TelegramNotificationService notifications;
    @Spy SyncJsonCodec codec = new SyncJsonCodec(new ObjectMapper());
    @InjectMocks SyncConflictServiceImpl service;
    private SyncConflict conflict() { return SyncConflict.builder().id(1L).flowId("flow").spreadsheetId("sheet")
            .sheetName("Data").idColumn("id").recordId("1").columnName("status")
            .baseValue("NEW").valueA("SHIPPING").valueB("CANCELLED").status("OPEN").build(); }
    private void givenConflict(String actualSheetStatus) {
        SyncConflict conflict = conflict();
        when(repository.findFlowIdById(1L)).thenReturn(Optional.of("flow"));
        when(repository.findLockedById(1L)).thenReturn(Optional.of(conflict));
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", actualSheetStatus))).build());
        when(store.getVaultRecord("flow", "1")).thenReturn(Map.of("id", "1", "status", "CANCELLED"));
        when(store.getSnapshot("flow", "1")).thenReturn(Map.of("id", "1", "status", "NEW"));
    }
    @Test void resolvingWritesSheetVaultAndCheckpointBeforeMarkingResolved() {
        givenConflict("SHIPPING");
        service.resolveConflict(1L, "CANCELLED", "test-token");
        org.mockito.InOrder order = inOrder(sheets, store, repository);
        order.verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "CANCELLED"));
        order.verify(store).saveVaultRecord("flow", "1", Map.of("id", "1", "status", "CANCELLED"));
        order.verify(store).saveSnapshot("flow", "1", Map.of("id", "1", "status", "CANCELLED"));
        order.verify(repository).save(argThat(c -> "RESOLVED".equals(c.getStatus()) && "CANCELLED".equals(c.getResolvedValue())));
    }
    @Test void providerFailureDoesNotMarkResolvedOrAdvanceCheckpoint() {
        givenConflict("SHIPPING");
        doThrow(new IllegalStateException("unavailable")).when(sheets).updateCells(anyString(), anyString(), anyMap());
        assertThrows(IllegalStateException.class, () -> service.resolveConflict(1L, "SHIPPING", "test-token"));
        verify(store, never()).saveSnapshot(anyString(), anyString(), anyMap());
        verify(store, never()).saveVaultRecord(anyString(), anyString(), anyMap());
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
        SyncDiffResult diff = new SyncDiffResult("1"); diff.addConflict("status", "NEW", "SHIPPING", "CANCELLED");
        List<SyncConflict> saved = service.saveConflicts(diff, RunSyncRequest.builder().flowId("flow").spreadsheetId("sheet").idColumn("id").build(), "Data");
        assertEquals(1L, saved.getFirst().getId());
        verify(repository, never()).save(any());
    }
    @Test void resolvedSourceChangesSupersedeThePreviousConflict() {
        when(repository.findByFlowIdAndStatus("flow", "OPEN")).thenReturn(List.of(conflict()));
        assertTrue(service.saveConflicts(new SyncDiffResult("1"), RunSyncRequest.builder().flowId("flow").build(), "Data").isEmpty());
        verify(repository).save(argThat(c -> "SUPERSEDED".equals(c.getStatus())));
    }

    @Test void resolvedConflictsCannotSendAlerts() {
        SyncConflict resolved = conflict();
        resolved.setStatus("RESOLVED");
        when(repository.findById(1L)).thenReturn(Optional.of(resolved));
        assertThrows(IllegalArgumentException.class, () -> service.resendTelegramAlert(1L, "123"));
        verifyNoInteractions(notifications);
    }

    @Test void failedResendIsReportedByTheService() {
        SyncConflict open = conflict();
        when(repository.findById(1L)).thenReturn(Optional.of(open));
        when(notifications.sendConflictAlert(open, "123")).thenReturn(false);
        assertFalse(service.resendTelegramAlert(1L, "123").isSuccess());
    }

    @Test
    void saveMultiSheetConflictSavesNewConflictWhenNoMatch() {
        when(repository.findByFlowIdAndStatus("flow", "OPEN")).thenReturn(List.of());
        SheetEndpointRequest ep1 = SheetEndpointRequest.builder().nodeId("n1").spreadsheetId("s1").sheetName("Tab1").build();
        SheetEndpointRequest ep2 = SheetEndpointRequest.builder().nodeId("n2").spreadsheetId("s2").sheetName("Tab2").build();

        Map<String, List<String>> changed = new LinkedHashMap<>();
        changed.put("V1", List.of("Tab1"));
        changed.put("V2", List.of("Tab2"));

        when(repository.save(any())).thenAnswer(invocation -> {
            SyncConflict c = invocation.getArgument(0);
            c.setId(10L);
            return c;
        });

        RunSyncRequest request = RunSyncRequest.builder().flowId("flow").idColumn("id").build();
        SyncConflict saved = service.saveMultiSheetConflict(
                request, List.of(ep1, ep2), "rec-1", "status", "BASE", changed, List.of("V1", "V2")
        );

        assertNotNull(saved);
        assertEquals(10L, saved.getId());
        assertEquals("rec-1", saved.getRecordId());
        assertEquals("status", saved.getColumnName());
        assertEquals("V1", saved.getValueA());
        assertEquals("V2", saved.getValueB());
        assertNotNull(saved.getCandidatesJson());
        assertNotNull(saved.getEndpointsJson());
    }

    @Test
    void resolveMultiSheetConflictUpdatesAllSheetsAndSnapshot() {
        SheetEndpointRequest ep1 = SheetEndpointRequest.builder().nodeId("n1").spreadsheetId("s1").sheetName("Tab1").build();
        SheetEndpointRequest ep2 = SheetEndpointRequest.builder().nodeId("n2").spreadsheetId("s2").sheetName("Tab2").build();
        List<SheetEndpointRequest> endpoints = List.of(ep1, ep2);

        Map<String, String> candidates = Map.of("Tab1", "V1", "Tab2", "V2");

        SyncConflict conflict = SyncConflict.builder()
                .id(5L)
                .flowId("flow")
                .idColumn("id")
                .recordId("rec-1")
                .columnName("status")
                .endpointsJson(codec.encode(endpoints))
                .candidatesJson(codec.encode(candidates))
                .valueA("V1")
                .valueB("V2")
                .status("OPEN")
                .build();

        when(repository.findFlowIdById(5L)).thenReturn(Optional.of("flow"));
        when(repository.findLockedById(5L)).thenReturn(Optional.of(conflict));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        when(sheets.readSheet(argThat(r -> r != null && "s1".equals(r.getSpreadsheetId()))))
                .thenReturn(SheetDataResponse.builder().spreadsheetId("s1").sheetName("Tab1")
                        .headers(List.of("id", "status")).rows(List.of(Map.of("id", "rec-1", "status", "V1"))).build());

        when(sheets.readSheet(argThat(r -> r != null && "s2".equals(r.getSpreadsheetId()))))
                .thenReturn(SheetDataResponse.builder().spreadsheetId("s2").sheetName("Tab2")
                        .headers(List.of("id", "status")).rows(List.of(Map.of("id", "rec-1", "status", "V2"))).build());

        when(store.getSnapshot("flow", "rec-1")).thenReturn(Map.of("id", "rec-1", "status", "BASE"));

        SyncConflict resolved = service.resolveConflict(5L, "V2", "test-token");

        assertEquals("RESOLVED", resolved.getStatus());
        assertEquals("V2", resolved.getResolvedValue());

        verify(sheets).updateCells("test-token", "s1", Map.of("'Tab1'!B2", "V2"));
        verify(sheets).updateCells("test-token", "s2", Map.of("'Tab2'!B2", "V2"));
        verify(store).saveSnapshot("flow", "rec-1", Map.of("id", "rec-1", "status", "V2"));
    }
}
