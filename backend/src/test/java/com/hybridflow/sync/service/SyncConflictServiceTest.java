package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.response.FieldConflict;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.repository.SyncConflictRepository;
import com.hybridflow.sync.service.impl.SyncConflictServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncConflictServiceTest {

    @Mock
    private SyncConflictRepository repository;

    @InjectMocks
    private SyncConflictServiceImpl service;

    @Test
    @DisplayName("Lưu danh sách xung đột khi DiffResult có conflict")
    void testSaveConflicts_WhenHasConflicts() {
        SyncDiffResult diffResult = new SyncDiffResult("ORD-001");
        diffResult.addConflict("status", "NEW", "SHIPPING", "CANCELLED");

        when(repository.save(any(SyncConflict.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<SyncConflict> saved = service.saveConflicts(diffResult);

        assertEquals(1, saved.size());
        SyncConflict conflict = saved.get(0);
        assertEquals("ORD-001", conflict.getRecordId());
        assertEquals("status", conflict.getColumnName());
        assertEquals("OPEN", conflict.getStatus());
        assertEquals("NEW", conflict.getBaseValue());
        assertEquals("SHIPPING", conflict.getValueA());
        assertEquals("CANCELLED", conflict.getValueB());
        verify(repository, times(1)).save(any(SyncConflict.class));
    }

    @Test
    @DisplayName("Không lưu gì khi DiffResult không có conflict")
    void testSaveConflicts_WhenNoConflicts() {
        SyncDiffResult diffResult = new SyncDiffResult("ORD-001");

        List<SyncConflict> saved = service.saveConflicts(diffResult);

        assertTrue(saved.isEmpty());
        verify(repository, never()).save(any(SyncConflict.class));
    }

    @Test
    @DisplayName("Giải quyết xung đột thành công (RESOLVED)")
    void testResolveConflict_Success() {
        SyncConflict existing = SyncConflict.builder()
                .id(1L)
                .recordId("ORD-001")
                .columnName("status")
                .status("OPEN")
                .build();

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(SyncConflict.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.resolveConflict(1L, "SHIPPING");

        assertEquals("RESOLVED", existing.getStatus());
        assertEquals("SHIPPING", existing.getResolvedValue());
        assertNotNull(existing.getResolvedAt());
        verify(repository).save(existing);
    }
}
