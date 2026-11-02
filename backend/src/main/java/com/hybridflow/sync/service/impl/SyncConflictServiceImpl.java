package com.hybridflow.sync.service.impl;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.repository.SyncConflictRepository;
import com.hybridflow.sync.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.*;

@RequiredArgsConstructor
@Service
public class SyncConflictServiceImpl implements SyncConflictService {
    private final SyncConflictRepository repository;
    private final SyncStore store;
    private final GoogleSheetsService sheets;

    @Override
    @Transactional
    public List<SyncConflict> saveConflicts(SyncDiffResult diff, RunSyncRequest context, String sheetName) {
        var existing = repository.findByFlowIdAndStatus(context.getFlowId(), "OPEN").stream()
                .filter(c -> c.getRecordId().equals(diff.getRecordId())).toList();
        List<SyncConflict> result = new ArrayList<>();
        Set<Long> retained = new HashSet<>();
        for (var field : diff.getConflicts()) {
            var match = existing.stream().filter(c -> c.getColumnName().equals(field.getColumn())
                    && Objects.equals(c.getValueA(), field.getValueA()) && Objects.equals(c.getValueB(), field.getValueB())
                    && Objects.equals(c.getBaseValue(), field.getBaseValue())).findFirst();
            if (match.isPresent()) {
                result.add(match.get());
                retained.add(match.get().getId());
            } else {
                result.add(repository.save(SyncConflict.builder().flowId(context.getFlowId())
                        .spreadsheetId(context.getSpreadsheetId()).sheetName(sheetName).idColumn(context.getIdColumn())
                        .recordId(diff.getRecordId()).columnName(field.getColumn()).baseValue(field.getBaseValue())
                        .valueA(field.getValueA()).valueB(field.getValueB()).status("OPEN").createdAt(LocalDateTime.now()).build()));
            }
        }
        for (var old : existing) {
            if (!retained.contains(old.getId())) {
                old.setStatus("SUPERSEDED");
                old.setResolvedAt(LocalDateTime.now());
                repository.save(old);
            }
        }
        return result;
    }

    @Override
    @Transactional
    public void resolveConflict(Long conflictId, String value, String accessToken) {
        if (accessToken == null || accessToken.isBlank() || accessToken.equals("ya29.mock"))
            throw new IllegalArgumentException("Cần kết nối Google để ghi giá trị đã chọn.");
        var flowId = repository.findFlowIdById(conflictId).orElseThrow(() ->
                new IllegalArgumentException("Xung đột không tồn tại hoặc thiếu nguồn dữ liệu. Chạy lại đồng bộ."));
        store.lock(flowId);
        // Reload after waiting for the flow lock so concurrent decisions cannot overwrite each other.
        var conflict = repository.findLockedById(conflictId).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy xung đột."));
        if (conflict.getSpreadsheetId() == null || conflict.getSheetName() == null)
            throw new IllegalArgumentException("Xung đột cũ thiếu nguồn dữ liệu. Chạy lại đồng bộ trước khi phê duyệt.");
        if (!"OPEN".equals(conflict.getStatus())) throw new IllegalArgumentException("Xung đột đã được xử lý. Tải lại danh sách.");
        if (!Objects.equals(value, conflict.getValueA()) && !Objects.equals(value, conflict.getValueB()))
            throw new IllegalArgumentException("Chỉ được chọn một trong hai giá trị đang xung đột.");
        var sheet = sheets.readSheet(ReadSheetRequest.builder().accessToken(accessToken)
                .spreadsheetId(conflict.getSpreadsheetId()).sheetname(conflict.getSheetName()).build());
        var index = SheetRows.index(sheet, conflict.getIdColumn());
        Integer rowIndex = index.get(conflict.getRecordId());
        var vault = store.read("vault_records", conflict.getFlowId(), conflict.getRecordId());
        var base = store.read("sync_snapshots", conflict.getFlowId(), conflict.getRecordId());
        if (rowIndex == null || vault == null || base == null
                || !Objects.equals(sheet.getRows().get(rowIndex).get(conflict.getColumnName()), conflict.getValueA())
                || !Objects.equals(vault.get(conflict.getColumnName()), conflict.getValueB()))
            throw new IllegalArgumentException("Dữ liệu đã đổi từ lúc phát hiện xung đột. Chạy lại đồng bộ trước khi chọn.");
        var cells = new LinkedHashMap<String, String>();
        cells.put(SheetRows.range(sheet, rowIndex, conflict.getColumnName()), value);
        sheets.updateCells(accessToken, conflict.getSpreadsheetId(), cells);
        vault = new LinkedHashMap<>(vault);
        base = new LinkedHashMap<>(base);
        vault.put(conflict.getColumnName(), value);
        base.put(conflict.getColumnName(), value);
        store.write("vault_records", conflict.getFlowId(), conflict.getRecordId(), vault);
        store.write("sync_snapshots", conflict.getFlowId(), conflict.getRecordId(), base);
        conflict.setResolvedValue(value);
        conflict.setStatus("RESOLVED");
        conflict.setResolvedAt(LocalDateTime.now());
        repository.save(conflict);
    }

    @Override
    @Transactional(readOnly = true)
    public SyncConflict getConflictById(Long id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy xung đột: " + id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SyncConflict> getOpenConflicts(String flowId) {
        if (flowId == null || flowId.isBlank()) throw new IllegalArgumentException("Cần Flow ID.");
        return repository.findByFlowIdAndStatus(flowId, "OPEN");
    }
}
