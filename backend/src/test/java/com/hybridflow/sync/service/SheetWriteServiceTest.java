package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.sync.model.SheetCellChange;
import com.hybridflow.sync.model.SheetWritePlan;
import com.hybridflow.sync.repository.SheetWriteJournalRepository;
import com.hybridflow.sync.service.impl.SheetWriteServiceImpl;
import com.hybridflow.sync.support.SyncJsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SheetWriteServiceTest {
    private final GoogleSheetsService sheets = mock(GoogleSheetsService.class);
    private final SheetWriteJournalRepository journal = mock(SheetWriteJournalRepository.class);
    private final SyncJsonCodec codec = new SyncJsonCodec(new ObjectMapper());
    private final SheetWriteService service = new SheetWriteServiceImpl(sheets, journal, codec);
    private final Map<String, String> live = new HashMap<>();
    private List<SheetWritePlan> plans() {
        return List.of(plan("a", "A"), plan("b", "B"));
    }
    private SheetWritePlan plan(String file, String before) {
        return new SheetWritePlan(file, "Data", "id", List.of("id", "status"),
                List.of(new SheetCellChange(0, "status", "1", before, "WINNER")));
    }
    @BeforeEach void setup() {
        live.put("a", "A"); live.put("b", "B");
        when(sheets.readSheet(any())).thenAnswer(inv -> {
            ReadSheetRequest request = inv.getArgument(0);
            return SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status"))
                    .rows(List.of(Map.of("id", "1", "status", live.get(request.getSpreadsheetId())))).build();
        });
        doAnswer(inv -> {
            Map<String, String> cells = inv.getArgument(2);
            live.put(inv.getArgument(1), cells.get("'Data'!B2"));
            return null;
        }).when(sheets).updateCells(anyString(), anyString(), anyMap());
    }
    @Test void failureOnLastSheetRestoresEarlierWritesIncludingAmbiguousTimeout() {
        doAnswer(inv -> {
            Map<String, String> cells = inv.getArgument(2);
            String value = cells.get("'Data'!B2");
            live.put("b", value);
            if (value.equals("WINNER")) throw new IllegalStateException("timeout after remote commit");
            return null;
        }).when(sheets).updateCells(anyString(), eq("b"), anyMap());
        assertThrows(IllegalStateException.class, () -> service.apply("token", plans()));
        assertEquals(Map.of("a", "A", "b", "B"), live);
        verify(journal).start(anyString(), anyString());
        verify(journal).recovered(anyString());
        verify(journal, never()).complete(anyString());
    }
    @Test void allSourcesAreValidatedBeforeAnyWrite() {
        live.put("b", "NEW_EDIT");
        assertThrows(IllegalStateException.class, () -> service.apply("token", plans()));
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
        verifyNoInteractions(journal);
    }
    @Test void interruptedWriteIsRecoveredBeforeNextRun() {
        live.put("a", "WINNER");
        when(journal.pending()).thenReturn(List.of(Map.of("id", "operation", "plans", codec.encode(plans()))));
        service.recover("token", List.of("a", "b"));
        assertEquals(Map.of("a", "A", "b", "B"), live);
        verify(journal).recovered("operation");
    }
    @Test void recoveryPreservesLaterHumanEditsAndLeavesDurableBlock() {
        live.put("a", "WINNER"); live.put("b", "HUMAN_EDIT");
        when(journal.pending()).thenReturn(List.of(Map.of("id", "operation", "plans", codec.encode(plans()))));
        assertThrows(IllegalStateException.class, () -> service.recover("token", List.of("a", "b")));
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
        verify(journal, never()).recovered(anyString());
        assertEquals("HUMAN_EDIT", live.get("b"));
    }
    @Test void overlappingFlowCannotIgnoreAnIncompleteOperation() {
        when(journal.pending()).thenReturn(List.of(Map.of("id", "operation", "plans", codec.encode(plans()))));
        assertThrows(IllegalStateException.class, () -> service.recover("token", List.of("a", "c")));
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
    }
    @Test void databaseRollbackRestoresRemoteCells() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.apply("token", plans());
            assertEquals("WINNER", live.get("a"));
            for (TransactionSynchronization callback : TransactionSynchronizationManager.getSynchronizations())
                callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            assertEquals(Map.of("a", "A", "b", "B"), live);
            verify(journal).recovered(anyString());
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }
    @Test void aNewRowCannotDuplicateAnIdInsertedElsewhereSincePlanning() {
        doReturn(SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status"))
                .rows(List.of(Map.of("id", "", "status", ""), Map.of("id", "1", "status", "HUMAN_EDIT"))).build()).when(sheets).readSheet(any());
        SheetWritePlan planned = new SheetWritePlan("a", "Data", "id", List.of("id", "status"), List.of(
                new SheetCellChange(0, "id", "1", "", "1"), new SheetCellChange(0, "status", "1", "", "NEW")));
        assertThrows(IllegalStateException.class, () -> service.apply("token", List.of(planned)));
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
    }

    @Test void recoveryDoesNotOrphanANewRowsPrivateData() {
        doReturn(SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status", "private"))
                .rows(List.of(Map.of("id", "1", "status", "NEW", "private", "HUMAN_EDIT"))).build()).when(sheets).readSheet(any());
        SheetWritePlan planned = new SheetWritePlan("a", "Data", "id", List.of("id", "status", "private"), List.of(
                new SheetCellChange(0, "id", "1", "", "1"), new SheetCellChange(0, "status", "1", "", "NEW")));
        when(journal.pending()).thenReturn(List.of(Map.of("id", "operation", "plans", codec.encode(List.of(planned)))));
        assertThrows(IllegalStateException.class, () -> service.recover("token", List.of("a")));
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
    }

    @Test void failedCleanupRestoresOriginalKeyAndValuesAfterRemoteCommit() {
        Map<String, String> row = new LinkedHashMap<>(Map.of("id", " sp01 ", "status", " new "));
        doAnswer(inv -> SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status"))
                .rows(List.of(new LinkedHashMap<>(row))).build()).when(sheets).readSheet(any());
        doAnswer(inv -> {
            Map<String, String> cells = inv.getArgument(2);
            if (cells.containsKey("'Data'!A2")) row.put("id", cells.get("'Data'!A2"));
            if (cells.containsKey("'Data'!B2")) row.put("status", cells.get("'Data'!B2"));
            if (row.get("id").equals("SP01")) throw new IllegalStateException("timeout after commit");
            return null;
        }).when(sheets).updateCells(anyString(), anyString(), anyMap());
        var plan = new SheetWritePlan("a", "Data", "id", List.of("id", "status"), List.of(
                new SheetCellChange(0, "id", " sp01 ", " sp01 ", "SP01"),
                new SheetCellChange(0, "status", " sp01 ", " new ", "NEW")));
        assertThrows(IllegalStateException.class, () -> service.apply("token", List.of(plan)));
        assertEquals(Map.of("id", " sp01 ", "status", " new "), row);
        verify(journal).recovered(anyString());
    }
}
