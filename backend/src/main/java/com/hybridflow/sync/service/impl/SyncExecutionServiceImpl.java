package com.hybridflow.sync.service.impl;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.response.FieldConflict;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.engine.ThreeWayDiffEngine;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.service.ExecutionHistoryService;
import com.hybridflow.sync.service.SyncConflictService;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.SyncStateService;
import com.hybridflow.sync.util.SheetRowUtils;
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
    private final SyncStateService store;
    private final ExecutionHistoryService history;

    @Override
    @Transactional
    public RunSyncResponse executeSync(RunSyncRequest request) {
        long start = System.currentTimeMillis();
        require(request.getAccessToken(), "Access token");
        require(request.getFlowId(), "Flow ID");
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
            if (request.getSheets() != null && request.getSheets().size() >= 2) {
                return executeMultiSheetSync(request, flow, idColumn, executionId, start);
            }
            return executeSheetToVaultSync(request, flow, idColumn, executionId, start);
        } catch (RuntimeException ex) {
            String errorMsg = (ex.getMessage() != null && !ex.getMessage().isBlank())
                    ? ex.getMessage()
                    : "Không hoàn tất đồng bộ. Kiểm tra cấu hình nguồn và kết nối.";
            history.finish(executionId, "ERROR", null, errorMsg);
            throw ex;
        }
    }

    private RunSyncResponse executeMultiSheetSync(
            RunSyncRequest request,
            String flow,
            String idColumn,
            String executionId,
            long start
    ) {
        List<SheetEndpointRequest> endpoints = request.getSheets();
        List<SheetDataResponse> sheetDataList = new ArrayList<>();
        List<Map<String, Integer>> indexList = new ArrayList<>();
        Set<String> uniqueTargets = new HashSet<>();

        for (int i = 0; i < endpoints.size(); i++) {
            SheetEndpointRequest ep = endpoints.get(i);
            require(ep.getSpreadsheetId(), "Spreadsheet ID của Sheet " + (i + 1));
            SheetDataResponse data = googleSheetsService.readSheet(ReadSheetRequest.builder()
                    .accessToken(request.getAccessToken())
                    .spreadsheetId(ep.getSpreadsheetId())
                    .sheetname(ep.getSheetName())
                    .build());
            ep.setSheetName(data.getSheetName());
            if (ep.getLabel() == null || ep.getLabel().isBlank()) {
                ep.setLabel("Sheet " + (i + 1) + " (" + data.getSheetName() + ")");
            }
            String targetKey = ep.getSpreadsheetId() + "::" + data.getSheetName();
            if (!uniqueTargets.add(targetKey)) {
                throw new IllegalArgumentException("Không được nối 2 khối trỏ vào cùng một file và cùng một tab: " + data.getSheetName());
            }
            sheetDataList.add(data);
            indexList.add(SheetRowUtils.index(data, idColumn));
        }

        Set<String> commonHeaders = new LinkedHashSet<>(sheetDataList.get(0).getHeaders());
        for (int i = 1; i < sheetDataList.size(); i++) {
            commonHeaders.retainAll(sheetDataList.get(i).getHeaders());
        }

        Set<String> columns = new LinkedHashSet<>(
                request.getSyncColumns() == null || request.getSyncColumns().isEmpty()
                        ? commonHeaders
                        : request.getSyncColumns()
        );
        if (!commonHeaders.containsAll(columns)) {
            throw new IllegalArgumentException("Cột đồng bộ phải tồn tại ở tất cả các bảng Google Sheet.");
        }
        columns.remove(idColumn);
        if (columns.isEmpty()) {
            throw new IllegalArgumentException("Các bảng cần có ít nhất 1 cột dữ liệu trùng tên ngoài cột khóa '" + idColumn + "'.");
        }

        List<String> boundColumns = new ArrayList<>();
        boundColumns.add(idColumn);
        boundColumns.addAll(columns);
        store.bindMultiSheets(flow, endpoints, idColumn, boundColumns);

        boolean hasAnyRow = indexList.stream().anyMatch(idx -> !idx.isEmpty());
        boolean initial = !store.hasSnapshots(flow);
        if (initial && hasAnyRow && !request.isBootstrapConfirmed()) {
            RunSyncResponse result = RunSyncResponse.builder()
                    .flowId(flow)
                    .executionId(executionId)
                    .status("AWAITING_CONFIRMATION")
                    .bootstrapRequired(true)
                    .sheetName(sheetDataList.get(0).getSheetName())
                    .totalRowsProcessed(0)
                    .cleanRecordIds(List.of())
                    .conflicts(List.of())
                    .comparedColumns(columns)
                    .latency((System.currentTimeMillis() - start) + " ms")
                    .build();
            completeAfterCommit(executionId, result);
            return result;
        }

        Set<String> allIds = new LinkedHashSet<>();
        for (Map<String, Integer> idx : indexList) {
            allIds.addAll(idx.keySet());
        }

        Map<String, Map<String, String>> snapshotWrites = new LinkedHashMap<>();
        List<Map<String, String>> writesPerSheet = new ArrayList<>();
        for (int i = 0; i < endpoints.size(); i++) {
            writesPerSheet.add(new LinkedHashMap<>());
        }

        List<String> clean = new ArrayList<>();
        List<SyncConflict> detected = new ArrayList<>();

        for (String id : allIds) {
            List<Map<String, String>> rowsAtId = new ArrayList<>();
            for (int i = 0; i < endpoints.size(); i++) {
                Integer rIdx = indexList.get(i).get(id);
                if (rIdx == null) {
                    throw new IllegalArgumentException(
                            "Bản ghi '" + id + "' chưa có trên '" + endpoints.get(i).getLabel() + "'. Hãy đảm bảo mã '" + id + "' có mặt trên các bảng."
                    );
                }
                rowsAtId.add(sheetDataList.get(i).getRows().get(rIdx));
            }

            Map<String, String> base = store.getSnapshot(flow, id);
            boolean isFirstSeen = (base == null);
            if (base == null) {
                base = new LinkedHashMap<>();
            }

            Map<String, String> checkpoint = new LinkedHashMap<>(base);
            checkpoint.put(idColumn, id);
            Set<String> unresolvedColumns = new HashSet<>();

            for (String col : columns) {
                List<String> currentValues = new ArrayList<>();
                for (Map<String, String> r : rowsAtId) {
                    currentValues.add(r.getOrDefault(col, ""));
                }

                String baseVal = base.get(col);
                if (isFirstSeen && currentValues.stream().distinct().count() == 1) {
                    baseVal = currentValues.get(0);
                }

                Map<String, List<String>> changedByValue = new LinkedHashMap<>();
                for (int i = 0; i < endpoints.size(); i++) {
                    String val = currentValues.get(i);
                    if (!Objects.equals(val, baseVal)) {
                        changedByValue.computeIfAbsent(val, k -> new ArrayList<>()).add(endpoints.get(i).getLabel());
                    }
                }

                if (changedByValue.isEmpty()) {
                    checkpoint.put(col, baseVal != null ? baseVal : currentValues.get(0));
                } else if (changedByValue.size() == 1) {
                    String winningValue = changedByValue.keySet().iterator().next();
                    for (int i = 0; i < endpoints.size(); i++) {
                        if (!Objects.equals(currentValues.get(i), winningValue)) {
                            int rIdx = indexList.get(i).get(id);
                            writesPerSheet.get(i).put(SheetRowUtils.range(sheetDataList.get(i), rIdx, col), winningValue);
                        }
                    }
                    checkpoint.put(col, winningValue);
                } else {
                    if ("SOURCE_WINS".equals(request.getConflictPolicy())) {
                        String winVal = currentValues.get(0);
                        for (int i = 1; i < endpoints.size(); i++) {
                            if (!Objects.equals(currentValues.get(i), winVal)) {
                                int rIdx = indexList.get(i).get(id);
                                writesPerSheet.get(i).put(SheetRowUtils.range(sheetDataList.get(i), rIdx, col), winVal);
                            }
                        }
                        checkpoint.put(col, winVal);
                    } else if ("DESTINATION_WINS".equals(request.getConflictPolicy())) {
                        String winVal = currentValues.get(endpoints.size() - 1);
                        for (int i = 0; i < endpoints.size() - 1; i++) {
                            if (!Objects.equals(currentValues.get(i), winVal)) {
                                int rIdx = indexList.get(i).get(id);
                                writesPerSheet.get(i).put(SheetRowUtils.range(sheetDataList.get(i), rIdx, col), winVal);
                            }
                        }
                        checkpoint.put(col, winVal);
                    } else {
                        unresolvedColumns.add(col);
                        SyncConflict saved = syncConflictService.saveMultiSheetConflict(
                                request, endpoints, id, col, baseVal, changedByValue, currentValues
                        );
                        detected.add(saved);
                    }
                }
            }

            snapshotWrites.put(id, checkpoint);
            if (unresolvedColumns.isEmpty()) clean.add(id);
        }

        for (int i = 0; i < endpoints.size(); i++) {
            Map<String, String> writes = writesPerSheet.get(i);
            if (!writes.isEmpty()) {
                googleSheetsService.updateCells(request.getAccessToken(), endpoints.get(i).getSpreadsheetId(), writes);
            }
        }
        snapshotWrites.forEach((id, row) -> store.saveSnapshot(flow, id, row));

        int sent = 0, failed = 0;
        if (request.isNotifyConflicts()) {
            for (SyncConflict conflict : detected) {
                if (telegramNotificationService.sendConflictAlert(conflict, request.getChatId())) sent++;
                else failed++;
            }
        }

        RunSyncResponse result = RunSyncResponse.builder()
                .flowId(flow)
                .sheetName(sheetDataList.get(0).getSheetName())
                .executionId(executionId)
                .status(detected.isEmpty() ? "SUCCESS" : "CONFLICT")
                .totalRowsProcessed(allIds.size())
                .cleanRecordIds(clean)
                .conflicts(detected)
                .comparedColumns(columns)
                .notificationsSent(sent)
                .notificationsFailed(failed)
                .latency((System.currentTimeMillis() - start) + " ms")
                .build();
        completeAfterCommit(executionId, result);
        return result;
    }

    private RunSyncResponse executeSheetToVaultSync(
            RunSyncRequest request,
            String flow,
            String idColumn,
            String executionId,
            long start
    ) {
        require(request.getSpreadsheetId(), "Spreadsheet ID");
        require(request.getStorageName(), "Vùng lưu trữ");
        SheetDataResponse sheet = googleSheetsService.readSheet(ReadSheetRequest.builder()
                .accessToken(request.getAccessToken()).spreadsheetId(request.getSpreadsheetId())
                .sheetname(request.getSheetName()).build());
        Map<String, Integer> index = SheetRowUtils.index(sheet, idColumn);
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
        for (Map<String, String> old : store.getVaultRecords(flow)) {
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
            Map<String, String> base = store.getSnapshot(flow, id);
            Map<String, String> rowB = store.getVaultRecord(flow, id);
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
            updatesA.forEach((column, value) -> sheetWrites.put(SheetRowUtils.range(sheet, entry.getValue(), column), value));
            Map<String, String> checkpoint = new LinkedHashMap<>(base);
            for (String column : columns) {
                if (!unresolved.contains(column)) checkpoint.put(column, merged.get(column));
            }
            vaultWrites.put(id, merged);
            snapshotWrites.put(id, checkpoint);
            if (unresolved.isEmpty()) clean.add(id);
        }
        googleSheetsService.updateCells(request.getAccessToken(), request.getSpreadsheetId(), sheetWrites);
        vaultWrites.forEach((id, row) -> store.saveVaultRecord(flow, id, row));
        snapshotWrites.forEach((id, row) -> store.saveSnapshot(flow, id, row));
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
