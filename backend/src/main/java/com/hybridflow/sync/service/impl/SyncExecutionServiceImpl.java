package com.hybridflow.sync.service.impl;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.FieldConflict;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.engine.ThreeWayDiffEngine;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.*;

@Service
@RequiredArgsConstructor
public class SyncExecutionServiceImpl implements SyncExecutionService {
    private final GoogleSheetsService googleSheetsService;
    private final ThreeWayDiffEngine threeWayDiffEngine;
    private final SyncConflictService syncConflictService;
    private final TelegramNotificationService telegramNotificationService;
    private final SyncStore store;
    private final ExecutionHistory history;

    @Override
    @Transactional
    public RunSyncResponse executeSync(RunSyncRequest request) {
        long start = System.currentTimeMillis();
        require(request.getAccessToken(), "Access token");
        require(request.getSpreadsheetId(), "Spreadsheet ID");
        require(request.getFlowId(), "Flow ID");
        require(request.getStorageName(), "Vùng lưu trữ");
        if (request.getFlowId().length() > 100) throw new IllegalArgumentException("Flow ID quá dài.");
        if (!Set.of("ASK_TELEGRAM", "SOURCE_WINS", "DESTINATION_WINS").contains(request.getConflictPolicy()))
            throw new IllegalArgumentException("Chính sách xung đột không hợp lệ.");
        if (request.isNotifyConflicts()) require(request.getChatId(), "Telegram Chat ID");
        String flow = request.getFlowId();
        String idColumn = request.getIdColumn() == null ? "id" : request.getIdColumn().trim();
        require(idColumn, "Cột khóa");
        request.setIdColumn(idColumn);
        store.lock(flow);
        String executionId = history.start(flow);
        try {
            SheetDataResponse sheet = googleSheetsService.readSheet(ReadSheetRequest.builder()
                    .accessToken(request.getAccessToken()).spreadsheetId(request.getSpreadsheetId())
                    .sheetname(request.getSheetName()).build());
            Map<String, Integer> index = SheetRows.index(sheet, idColumn);
            Set<String> columns = new LinkedHashSet<>(request.getSyncColumns() == null || request.getSyncColumns().isEmpty()
                    ? sheet.getHeaders() : request.getSyncColumns());
            if (!sheet.getHeaders().containsAll(columns)) throw new IllegalArgumentException("Cột đồng bộ không tồn tại trong Sheet.");
            columns.remove(idColumn);
            if (columns.isEmpty()) throw new IllegalArgumentException("Cần ít nhất một cột dữ liệu ngoài cột khóa.");
            store.bind(flow, request.getSpreadsheetId(), sheet.getSheetName(), idColumn, sheet.getHeaders(), request.getStorageName());
            boolean initial = !store.hasSnapshots(flow);
            if (initial && !index.isEmpty() && !request.isBootstrapConfirmed()) {
                RunSyncResponse result = RunSyncResponse.builder().flowId(flow).executionId(executionId).status("AWAITING_CONFIRMATION")
                        .bootstrapRequired(true).sheetName(sheet.getSheetName()).totalRowsProcessed(0)
                        .cleanRecordIds(List.of()).conflicts(List.of()).comparedColumns(columns)
                        .latency((System.currentTimeMillis() - start) + " ms").build();
                completeAfterCommit(executionId, result);
                return result;
            }
            // Deletions need an explicit policy; never silently treat a missing row as a successful sync.
            for (Map<String, String> old : store.vault(flow)) {
                if (!index.containsKey(old.get(idColumn))) throw new IllegalArgumentException(
                        "Bản ghi " + old.get(idColumn) + " đã bị xóa khỏi Sheet. Khôi phục dòng hoặc tạo luồng mới để khởi tạo lại.");
            }
            Map<String, Map<String, String>> vaultWrites = new LinkedHashMap<>();
            Map<String, Map<String, String>> snapshotWrites = new LinkedHashMap<>();
            Map<String, String> sheetWrites = new LinkedHashMap<>();
            List<String> clean = new ArrayList<>();
            List<SyncConflict> detected = new ArrayList<>();
            for (Map.Entry<String, Integer> entry : index.entrySet()) {
                String id = entry.getKey();
                Map<String, String> rowA = sheet.getRows().get(entry.getValue());
                Map<String, String> base = store.read("sync_snapshots", flow, id);
                Map<String, String> rowB = store.read("vault_records", flow, id);
                if (base == null) {
                    if (rowB != null) throw new IllegalArgumentException("Vault có dữ liệu nhưng thiếu snapshot cho bản ghi " + id);
                    vaultWrites.put(id, new LinkedHashMap<>(rowA));
                    snapshotWrites.put(id, new LinkedHashMap<>(rowA));
                    clean.add(id);
                    continue;
                }
                if (rowB == null) throw new IllegalArgumentException("Thiếu bản ghi Vault: " + id);
                SyncDiffResult diff = threeWayDiffEngine.compareRow(id, base, rowA, rowB, columns);
                Map<String, String> merged = new LinkedHashMap<>(rowB);
                merged.putAll(diff.getUpdatesForB());
                Map<String, String> updatesA = new LinkedHashMap<>(diff.getUpdatesForA());
                Set<String> unresolved = new HashSet<>();
                for (FieldConflict conflict : diff.getConflicts()) {
                    switch (request.getConflictPolicy()) {
                        case "SOURCE_WINS" -> merged.put(conflict.getColumn(), conflict.getValueA());
                        case "DESTINATION_WINS" -> updatesA.put(conflict.getColumn(), conflict.getValueB());
                        default -> unresolved.add(conflict.getColumn());
                    }
                }
                SyncDiffResult openDiff = new SyncDiffResult(id);
                for (FieldConflict conflict : diff.getConflicts()) {
                    if (unresolved.contains(conflict.getColumn())) openDiff.addConflict(conflict.getColumn(),
                            conflict.getBaseValue(), conflict.getValueA(), conflict.getValueB());
                }
                detected.addAll(syncConflictService.saveConflicts(openDiff, request, sheet.getSheetName()));
                updatesA.forEach((column, value) -> sheetWrites.put(SheetRows.range(sheet, entry.getValue(), column), value));
                Map<String, String> checkpoint = new LinkedHashMap<>(base);
                for (String column : columns) {
                    if (!unresolved.contains(column)) checkpoint.put(column, merged.get(column));
                }
                vaultWrites.put(id, merged);
                snapshotWrites.put(id, checkpoint);
                if (unresolved.isEmpty()) clean.add(id);
            }
            // One RAW batch writes all changed cells; a failed request prevents checkpoint advancement.
            googleSheetsService.updateCells(request.getAccessToken(), request.getSpreadsheetId(), sheetWrites);
            vaultWrites.forEach((id, row) -> store.write("vault_records", flow, id, row));
            snapshotWrites.forEach((id, row) -> store.write("sync_snapshots", flow, id, row));
            int sent = 0, failed = 0;
            if (request.isNotifyConflicts()) {
                for (SyncConflict conflict : detected) {
                    if (telegramNotificationService.sendConflictAlert(conflict, request.getChatId())) sent++; else failed++;
                }
            }
            RunSyncResponse result = RunSyncResponse.builder().flowId(flow).sheetName(sheet.getSheetName()).executionId(executionId)
                    .status(detected.isEmpty() ? "SUCCESS" : "CONFLICT").totalRowsProcessed(index.size())
                    .cleanRecordIds(clean).conflicts(detected).comparedColumns(columns)
                    .notificationsSent(sent).notificationsFailed(failed).latency((System.currentTimeMillis() - start) + " ms").build();
            completeAfterCommit(executionId, result);
            return result;
        } catch (RuntimeException ex) {
            history.finish(executionId, "ERROR", null, "Không hoàn tất đồng bộ. Kiểm tra cấu hình nguồn và kết nối.");
            throw ex;
        }
    }

    private void completeAfterCommit(String executionId, RunSyncResponse result) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            history.finish(executionId, result.getStatus(), result, null);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                history.finish(executionId, result.getStatus(), result, null);
            }
            @Override public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) history.finish(executionId, "ERROR", null,
                        "Giao dịch database không hoàn tất. Chạy lại đối soát dữ liệu.");
            }
        });
    }

    private static void require(String value, String name) {
        if (value == null || value.isBlank() || value.equals("ya29.mock"))
            throw new IllegalArgumentException(name + " không được để trống hoặc dùng dữ liệu giả.");
    }
}
