package com.hybridflow.sync.service.impl;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.sync.model.SheetCellChange;
import com.hybridflow.sync.model.SheetWritePlan;
import com.hybridflow.sync.repository.SheetWriteJournalRepository;
import com.hybridflow.sync.service.SheetWriteService;
import com.hybridflow.sync.support.SyncJsonCodec;
import com.hybridflow.sync.util.SheetRowUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.*;

@Service
@RequiredArgsConstructor
public class SheetWriteServiceImpl implements SheetWriteService {
    private final GoogleSheetsService sheets;
    private final SheetWriteJournalRepository journal;
    private final SyncJsonCodec codec;

    @Override
    public void recover(String token, List<String> spreadsheetIds) {
        for (Map<String, Object> entry : journal.pending()) {
            List<SheetWritePlan> plans = codec.decodeWritePlans((String) entry.get("plans"));
            if (plans.stream().noneMatch(p -> spreadsheetIds.contains(p.getSpreadsheetId()))) continue;
            if (!spreadsheetIds.containsAll(plans.stream().map(SheetWritePlan::getSpreadsheetId).toList()))
                throw new IllegalStateException("Có lần ghi dở dang liên quan Sheet này. Chạy lại luồng gốc để đối soát trước.");
            restore(token, plans);
            journal.recovered((String) entry.get("id"));
        }
    }

    @Override
    public void apply(String token, List<SheetWritePlan> requested) {
        List<SheetWritePlan> plans = requested.stream().filter(p -> !p.getChanges().isEmpty()).toList();
        if (plans.isEmpty()) return;
        for (SheetWritePlan plan : plans) validate(plan, read(token, plan), false);
        String operationId = UUID.randomUUID().toString();
        journal.start(operationId, codec.encode(plans));
        boolean synchronizedTransaction = TransactionSynchronizationManager.isSynchronizationActive();
        if (synchronizedTransaction) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        try { restore(token, plans); journal.recovered(operationId); }
                        catch (RuntimeException ignored) { /* Pending intent blocks the next sync until recovery. */ }
                    }
                }
            });
        }
        try {
            for (SheetWritePlan plan : plans) {
                validate(plan, read(token, plan), false);
                sheets.updateCells(token, plan.getSpreadsheetId(), cells(plan));
            }
            journal.complete(operationId);
        } catch (RuntimeException failure) {
            if (!synchronizedTransaction) {
                try { restore(token, plans); journal.recovered(operationId); }
                catch (RuntimeException recoveryFailure) { failure.addSuppressed(recoveryFailure); }
            }
            throw new IllegalStateException("Lần ghi chưa hoàn tất. Hệ thống sẽ đối soát lần ghi dở dang trước khi cho chạy tiếp.", failure);
        }
    }

    private void restore(String token, List<SheetWritePlan> plans) {
        for (SheetWritePlan plan : plans) validate(plan, read(token, plan), true);
        for (SheetWritePlan plan : plans) {
            SheetDataResponse live = read(token, plan);
            validate(plan, live, true);
            Map<String, String> rollback = new LinkedHashMap<>();
            for (SheetCellChange cell : plan.getChanges()) {
                if (!Objects.equals(value(live, cell.getRowIndex(), cell.getColumn()), cell.getBefore()))
                    rollback.put(SheetRowUtils.range(live, cell.getRowIndex(), cell.getColumn()), cell.getBefore());
            }
            if (!rollback.isEmpty()) sheets.updateCells(token, plan.getSpreadsheetId(), rollback);
        }
    }

    private SheetDataResponse read(String token, SheetWritePlan plan) {
        return sheets.readSheet(ReadSheetRequest.builder().accessToken(token).spreadsheetId(plan.getSpreadsheetId())
                .sheetname(plan.getSheetName()).build());
    }

    private void validate(SheetWritePlan plan, SheetDataResponse live, boolean recovering) {
        if (!Objects.equals(plan.getHeaders(), live.getHeaders()) || !Objects.equals(plan.getSheetName(), live.getSheetName())) stale();
        Map<String, Integer> liveIndex = SheetRowUtils.index(live, plan.getIdColumn());
        Set<Integer> newRows = new HashSet<>();
        for (SheetCellChange cell : plan.getChanges()) {
            if (cell.getColumn().equals(plan.getIdColumn()) && cell.getBefore().isEmpty()) newRows.add(cell.getRowIndex());
        }
        for (Integer row : newRows) {
            if (row >= live.getRows().size()) continue;
            Set<String> plannedColumns = new HashSet<>();
            plan.getChanges().stream().filter(cell -> cell.getRowIndex() == row).forEach(cell -> plannedColumns.add(cell.getColumn()));
            if (live.getRows().get(row).entrySet().stream().anyMatch(entry -> !plannedColumns.contains(entry.getKey())
                    && entry.getValue() != null && !entry.getValue().isEmpty())) stale();
        }
        for (SheetCellChange cell : plan.getChanges()) {
            Integer existingPosition = liveIndex.get(cell.getRecordId());
            if (existingPosition != null && existingPosition != cell.getRowIndex()) stale();
            String liveId = value(live, cell.getRowIndex(), plan.getIdColumn());
            boolean transformedId = recovering && plan.getChanges().stream().anyMatch(change ->
                    change.getRowIndex() == cell.getRowIndex() && change.getColumn().equals(plan.getIdColumn())
                            && Objects.equals(liveId, change.getAfter()));
            if (!Objects.equals(liveId, cell.getRecordId()) && !transformedId && !(newRows.contains(cell.getRowIndex()) && liveId.isEmpty())) stale();
            String current = value(live, cell.getRowIndex(), cell.getColumn());
            if (!Objects.equals(current, cell.getBefore()) && !(recovering && Objects.equals(current, cell.getAfter()))) stale();
            if (newRows.contains(cell.getRowIndex()) && liveId.isEmpty() && cell.getRowIndex() < live.getRows().size()
                    && live.getRows().get(cell.getRowIndex()).values().stream().anyMatch(v -> v != null && !v.isEmpty())) stale();
        }
    }

    private Map<String, String> cells(SheetWritePlan plan) {
        SheetDataResponse layout = SheetDataResponse.builder().sheetName(plan.getSheetName()).headers(plan.getHeaders()).build();
        Map<String, String> cells = new LinkedHashMap<>();
        for (SheetCellChange cell : plan.getChanges()) cells.put(SheetRowUtils.range(layout, cell.getRowIndex(), cell.getColumn()), cell.getAfter());
        return cells;
    }

    private String value(SheetDataResponse sheet, int row, String column) {
        return row < sheet.getRows().size() ? sheet.getRows().get(row).getOrDefault(column, "") : "";
    }

    private void stale() {
        throw new IllegalStateException("Dữ liệu hoặc vị trí dòng đã đổi. Không ghi đè; chạy lại đồng bộ để đối soát. Nếu lần ghi trước đang dở, khôi phục dữ liệu rồi chạy lại luồng gốc.");
    }
}
