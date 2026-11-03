package com.hybridflow.sync.service.impl;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.util.ErrorClassifier;
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

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

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
                throw new ApplicationException(ErrorCode.SYNC_RECOVERY_REQUIRED);
            restore(token, plans);
            journal.recovered((String) entry.get("id"));
        }
    }

    @Override
    public void apply(String token, List<SheetWritePlan> requested) {
        List<SheetWritePlan> plans = requested.stream().filter(p -> !p.getChanges().isEmpty()).toList();
        if (plans.isEmpty()) return;
        for (SheetWritePlan plan : plans) {
            SheetDataResponse live = read(token, plan);
            validate(plan, live, false);
            for (SheetCellChange cell : plan.getChanges()) {
                cell.setBeforeValueType(SheetRowUtils.valueType(live, cell.getRowIndex(), cell.getColumn()));
                cell.setBeforeRawValue(live.getRawRows() != null && cell.getRowIndex() < live.getRawRows().size()
                        ? live.getRawRows().get(cell.getRowIndex()).getOrDefault(cell.getColumn(), "") : cell.getBefore());
            }
        }
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
                send(token, plan.getSpreadsheetId(), cells(plan), types(plan, false));
            }
            for (SheetWritePlan plan : plans) verifyApplied(token, plan);
            journal.complete(operationId);
        } catch (RuntimeException failure) {
            if (!synchronizedTransaction) {
                try { restore(token, plans); journal.recovered(operationId); }
                catch (RuntimeException recoveryFailure) { failure.addSuppressed(recoveryFailure); }
            }
            ErrorDetails details = ErrorClassifier.classify(failure);
            ErrorCode code = details.getCode() == ErrorCode.INTERNAL_ERROR ? ErrorCode.SYNC_RECOVERY_REQUIRED : details.getCode();
            throw new ApplicationException(code, code == ErrorCode.SYNC_RECOVERY_REQUIRED ? code.getMessage() : details.getMessage(), failure, details.getRetryAfterSeconds());
        }
    }

    private void verifyApplied(String token, SheetWritePlan plan) {
        SheetDataResponse live = read(token, plan);
        if (!Objects.equals(plan.getHeaders(), live.getHeaders()) || !Objects.equals(plan.getSheetName(), live.getSheetName())) stale();
        SheetRowUtils.index(live, plan.getIdColumn());
        Map<Integer, String> expectedIds = new HashMap<>();
        for (SheetCellChange cell : plan.getChanges()) {
            if (cell.getColumn().equals(plan.getIdColumn())) expectedIds.put(cell.getRowIndex(), cell.getAfter());
        }
        for (SheetCellChange cell : plan.getChanges()) {
            String expectedId = expectedIds.getOrDefault(cell.getRowIndex(), cell.getRecordId());
            if (!Objects.equals(expectedId, value(live, cell.getRowIndex(), plan.getIdColumn()))
                    || !Objects.equals(cell.getAfter(), value(live, cell.getRowIndex(), cell.getColumn()))
                    || SheetRowUtils.requiresTypeWrite(live, cell.getRowIndex(), cell.getColumn(), cell.getAfter(), plan.getColumnTypes())) {
                throw new ApplicationException(ErrorCode.SYNC_VERIFY_FAILED);
            }
        }
    }

    private void restore(String token, List<SheetWritePlan> plans) {
        for (SheetWritePlan plan : plans) validate(plan, read(token, plan), true);
        for (SheetWritePlan plan : plans) {
            SheetDataResponse live = read(token, plan);
            validate(plan, live, true);
            Map<String, String> rollback = new LinkedHashMap<>();
            for (SheetCellChange cell : plan.getChanges()) {
                if (!Objects.equals(value(live, cell.getRowIndex(), cell.getColumn()), cell.getBefore())
                        || cell.getBeforeValueType() != null && !cell.getBeforeValueType().equals(SheetRowUtils.valueType(live, cell.getRowIndex(), cell.getColumn())))
                    rollback.put(SheetRowUtils.range(live, cell.getRowIndex(), cell.getColumn()), cell.getBeforeRawValue() == null ? cell.getBefore() : cell.getBeforeRawValue());
            }
            if (!rollback.isEmpty()) send(token, plan.getSpreadsheetId(), rollback, types(plan, true));
        }
    }

    private SheetDataResponse read(String token, SheetWritePlan plan) {
        return sheets.readSheet(ReadSheetRequest.builder().accessToken(token).spreadsheetId(plan.getSpreadsheetId())
                .sheetname(plan.getSheetName()).columnTypes(plan.getColumnTypes()).build());
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

    private Map<String, String> types(SheetWritePlan plan, boolean restoring) {
        if (plan.getColumnTypes() == null || plan.getColumnTypes().isEmpty()) return Map.of();
        SheetDataResponse layout = SheetDataResponse.builder().sheetName(plan.getSheetName()).headers(plan.getHeaders()).build();
        Map<String, String> types = new LinkedHashMap<>();
        for (SheetCellChange cell : plan.getChanges()) types.put(SheetRowUtils.range(layout, cell.getRowIndex(), cell.getColumn()),
                restoring ? (cell.getBeforeValueType() == null ? "TEXT" : cell.getBeforeValueType()) : plan.getColumnTypes().getOrDefault(cell.getColumn(), "TEXT"));
        return types;
    }

    private void send(String token, String spreadsheetId, Map<String, String> cells, Map<String, String> types) {
        if (types.isEmpty()) sheets.updateCells(token, spreadsheetId, cells);
        else sheets.updateTypedCells(token, spreadsheetId, cells, types);
    }

    private String value(SheetDataResponse sheet, int row, String column) {
        return row < sheet.getRows().size() ? sheet.getRows().get(row).getOrDefault(column, "") : "";
    }

    private void stale() {
        throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Dữ liệu hoặc vị trí dòng đã đổi. Chạy lại đồng bộ để đối soát trước khi ghi.");
    }
}
