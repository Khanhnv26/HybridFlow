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
import com.hybridflow.sync.model.SheetWritePlan;
import com.hybridflow.sync.model.SheetCellChange;
import com.hybridflow.sync.service.SheetWriteService;
import com.hybridflow.sync.service.ExecutionHistoryService;
import com.hybridflow.sync.service.SyncConflictService;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.SyncStateService;
import com.hybridflow.sync.util.SheetRowUtils;
import com.hybridflow.sync.util.SheetEndpointUtils;
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
    private final SheetWriteService writes;
    private final com.hybridflow.sync.service.DataTransformerService dataTransformerService;

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
            if (request.isScheduledExecution()) phase(request, executionId, "trigger", "TRIGGER", "Kích hoạt theo lịch");
            phase(request, executionId, "diff", "PREPARE", "Đang chuẩn bị và chờ quyền đồng bộ");
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
        List<String> spreadsheetIds = endpoints.stream().map(SheetEndpointRequest::getSpreadsheetId).peek(id -> require(id, "Spreadsheet ID"))
                .distinct().sorted().toList();
        spreadsheetIds.forEach(id -> store.lock("sheet:" + id));
        phase(request, executionId, "sheets", "RECOVER", "Đang kiểm tra lần ghi trước");
        writes.recover(request.getAccessToken(), spreadsheetIds);
        List<SheetDataResponse> data = new ArrayList<>();
        List<List<Map<String, String>>> rawRows = new ArrayList<>();
        List<Map<String, Integer>> indexes = new ArrayList<>();
        List<SheetWritePlan> plans = new ArrayList<>();
        Set<String> targets = new HashSet<>();
        for (SheetEndpointRequest endpoint : endpoints) {
            phase(executionId, endpoint.getNodeId() == null ? List.of() : List.of(endpoint.getNodeId()), "READ", "Đang đọc trang tính");
            SheetDataResponse sheet = googleSheetsService.readSheet(ReadSheetRequest.builder().accessToken(request.getAccessToken())
                    .spreadsheetId(endpoint.getSpreadsheetId()).sheetname(endpoint.getSheetName()).build());
            endpoint.setSheetName(sheet.getSheetName());
            endpoint.setSpreadsheetTitle(sheet.getSpreadsheetTitle());
            if (!targets.add(SheetEndpointUtils.identity(endpoint)))
                throw new IllegalArgumentException("Không được nối hai khối vào cùng file và trang tính.");
            rawRows.add(sheet.getRows());
            if (endpoint.getTransforms() != null && !endpoint.getTransforms().isEmpty()) {
                phase(request, executionId, "transform:" + endpoint.getNodeId(), "TRANSFORM", "Đang chuẩn hóa dữ liệu");
                transformSheet(sheet, endpoint.getTransforms());
            }
            data.add(sheet);
            indexes.add(SheetRowUtils.index(sheet, idColumn));
            plans.add(new SheetWritePlan(endpoint.getSpreadsheetId(), sheet.getSheetName(), idColumn, sheet.getHeaders(), new ArrayList<>()));
        }
        phase(request, executionId, "diff", "COMPARE", "Đang so khớp dữ liệu");
        if (request.getSyncColumns() == null || request.getSyncColumns().isEmpty())
            throw new IllegalArgumentException("Chọn rõ các cột được phép đồng bộ trong khối So khớp. Cột trùng tên không tự động được chia sẻ.");
        Set<String> columns = new TreeSet<>(request.getSyncColumns());
        columns.remove(idColumn);
        if (columns.isEmpty() || data.stream().anyMatch(sheet -> !sheet.getHeaders().containsAll(columns)))
            throw new IllegalArgumentException("Chọn ít nhất một cột dữ liệu có mặt trên tất cả trang tính.");
        List<String> boundColumns = new ArrayList<>(List.of(idColumn));
        boundColumns.addAll(columns);
        store.bindMultiSheets(flow, endpoints, idColumn, boundColumns);
        if (!store.hasSnapshots(flow) && indexes.stream().anyMatch(index -> !index.isEmpty()) && !request.isBootstrapConfirmed()) {
            RunSyncResponse result = RunSyncResponse.builder().flowId(flow).executionId(executionId).status("AWAITING_CONFIRMATION")
                    .bootstrapRequired(true).sheetName(data.getFirst().getSheetName()).totalRowsProcessed(0).cleanRecordIds(List.of())
                    .conflicts(List.of()).comparedColumns(columns).latency((System.currentTimeMillis() - start) + " ms").build();
            completeAfterCommit(executionId, result);
            return result;
        }
        Set<Long> previouslyOpen = new HashSet<>(syncConflictService.getOpenConflicts(flow).stream().map(SyncConflict::getId).toList());
        Set<String> allIds = new LinkedHashSet<>();
        indexes.forEach(index -> allIds.addAll(index.keySet()));
        if (!allIds.containsAll(store.getSnapshotRecordIds(flow)))
            throw new IllegalArgumentException("Có bản ghi đã bị xóa khỏi mọi trang tính. Khôi phục dòng hoặc tạo luồng mới để khởi tạo lại.");
        List<Integer> nextRows = new ArrayList<>(data.stream().map(sheet -> sheet.getRows().size()).toList());
        Map<String, Map<String, String>> checkpoints = new LinkedHashMap<>();
        List<String> clean = new ArrayList<>();
        List<SyncConflict> detected = new ArrayList<>();
        for (String id : allIds) {
            Map<String, String> base = store.getSnapshot(flow, id);
            List<Integer> positions = new ArrayList<>();
            boolean missing = false;
            for (int i = 0; i < endpoints.size(); i++) {
                Integer position = indexes.get(i).get(id);
                if (position == null) {
                    if (base != null) throw new IllegalArgumentException("Bản ghi '" + id + "' đã mất khỏi một trang tính. Khôi phục dòng trước khi đồng bộ; hệ thống chưa tự lan truyền thao tác xóa.");
                    missing = true;
                    position = nextRows.get(i);
                    nextRows.set(i, position + 1);
                    plans.get(i).getChanges().add(new SheetCellChange(position, idColumn, id, "", id));
                }
                positions.add(position);
            }
            Map<String, String> checkpoint = base == null ? new LinkedHashMap<>() : new LinkedHashMap<>(base);
            checkpoint.put(idColumn, id);
            boolean unresolved = false;
            for (String column : columns) {
                List<String> values = new ArrayList<>();
                Map<String, List<String>> changed = new LinkedHashMap<>();
                String baseValue = base == null ? null : base.get(column);
                for (int i = 0; i < endpoints.size(); i++) {
                    Integer originalPosition = indexes.get(i).get(id);
                    String current = originalPosition == null ? "" : data.get(i).getRows().get(originalPosition).getOrDefault(column, "");
                    values.add(current);
                    if (originalPosition != null && !Objects.equals(current, baseValue))
                        changed.computeIfAbsent(current, key -> new ArrayList<>()).add(endpoints.get(i).getLabel());
                }
                String winner = baseValue;
                if (changed.size() == 1) winner = changed.keySet().iterator().next();
                else if (changed.size() > 1) {
                    if ("SOURCE_WINS".equals(request.getConflictPolicy()) || "DESTINATION_WINS".equals(request.getConflictPolicy())) {
                        int preferred = "SOURCE_WINS".equals(request.getConflictPolicy()) ? 0 : endpoints.size() - 1;
                        if (!indexes.get(preferred).containsKey(id))
                            throw new IllegalArgumentException("Bảng ưu tiên chưa có mã '" + id + "'. Không thể tự chọn giá trị cho dòng mới.");
                        winner = values.get(preferred);
                    } else {
                        if (missing) throw new IllegalArgumentException("Dòng mới '" + id + "' có nhiều giá trị khác nhau. Thống nhất dòng trên các bảng đang có trước khi tạo bản sao.");
                        detected.add(syncConflictService.saveMultiSheetConflict(request, endpoints, id, column, baseValue, changed, values));
                        unresolved = true;
                        continue;
                    }
                }
                if (winner == null) winner = "";
                checkpoint.put(column, winner);
                for (int i = 0; i < endpoints.size(); i++) {
                    if (!Objects.equals(values.get(i), winner)) plans.get(i).getChanges().add(
                            new SheetCellChange(positions.get(i), column, id, values.get(i), winner));
                }
            }
            checkpoints.put(id, checkpoint);
            if (!unresolved) clean.add(id);
        }
        phase(request, executionId, "sheets", "WRITE", "Đang ghi và lưu checkpoint");
        for (int i = 0; i < plans.size(); i++) {
            mergeTransformWrites(plans.get(i), rawRows.get(i), data.get(i).getRows(), endpoints.get(i).isWriteBackCleanData());
        }
        writes.apply(request.getAccessToken(), plans);
        checkpoints.forEach((id, row) -> store.saveSnapshot(flow, id, row));
        syncConflictService.retainOpenConflicts(flow, detected.stream().map(SyncConflict::getId).toList());
        int sent = 0, failed = 0;
        if (request.isNotifyConflicts()) {
            if (detected.stream().anyMatch(conflict -> !previouslyOpen.contains(conflict.getId())))
                phase(request, executionId, "telegram", "NOTIFY", "Đang gửi cảnh báo xung đột");
            for (SyncConflict conflict : detected) {
                if (previouslyOpen.contains(conflict.getId())) continue;
                if (telegramNotificationService.sendConflictAlert(conflict, request.getChatId())) sent++; else failed++;
            }
        }
        RunSyncResponse result = RunSyncResponse.builder().flowId(flow).executionId(executionId).sheetName(data.getFirst().getSheetName())
                .status(detected.isEmpty() ? "SUCCESS" : "CONFLICT").totalRowsProcessed(allIds.size()).cleanRecordIds(clean)
                .conflicts(detected).comparedColumns(columns).notificationsSent(sent).notificationsFailed(failed)
                .latency((System.currentTimeMillis() - start) + " ms").build();
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
        store.lock("sheet:" + request.getSpreadsheetId());
        phase(request, executionId, "sheets", "RECOVER", "Đang kiểm tra lần ghi trước");
        writes.recover(request.getAccessToken(), List.of(request.getSpreadsheetId()));
        phase(request, executionId, "sheets", "READ", "Đang đọc trang tính");
        SheetDataResponse sheet = googleSheetsService.readSheet(ReadSheetRequest.builder()
                .accessToken(request.getAccessToken()).spreadsheetId(request.getSpreadsheetId())
                .sheetname(request.getSheetName()).build());
        List<Map<String, String>> rawRows = sheet.getRows();
        if (request.getTransforms() != null && !request.getTransforms().isEmpty()) {
            phase(request, executionId, "transforms", "TRANSFORM", "Đang chuẩn hóa dữ liệu");
            transformSheet(sheet, request.getTransforms());
        }
        phase(request, executionId, "diff", "COMPARE", "Đang so khớp dữ liệu");
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
        if (request.isWriteBackCleanData()) for (int row = 0; row < rawRows.size(); row++) {
            for (String column : sheet.getHeaders()) {
                String value = sheet.getRows().get(row).getOrDefault(column, "");
                if (!Objects.equals(rawRows.get(row).getOrDefault(column, ""), value))
                    sheetWrites.put(SheetRowUtils.range(sheet, row, column), value);
            }
        }
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
        phase(request, executionId, "sheets", "WRITE", "Đang đối soát và ghi trang tính");
        if (request.getTransforms() != null && !request.getTransforms().isEmpty()) {
            List<SheetCellChange> changes = new ArrayList<>();
            for (int row = 0; row < rawRows.size(); row++) for (String column : sheet.getHeaders()) {
                String range = SheetRowUtils.range(sheet, row, column);
                if (sheetWrites.containsKey(range) && !Objects.equals(rawRows.get(row).getOrDefault(column, ""), sheetWrites.get(range)))
                    changes.add(new SheetCellChange(row, column, rawRows.get(row).get(idColumn), rawRows.get(row).getOrDefault(column, ""), sheetWrites.get(range)));
            }
            writes.apply(request.getAccessToken(), List.of(new SheetWritePlan(request.getSpreadsheetId(), sheet.getSheetName(), idColumn, sheet.getHeaders(), changes)));
        } else googleSheetsService.updateCells(request.getAccessToken(), request.getSpreadsheetId(), sheetWrites);
        phase(request, executionId, "storage", "WRITE", "Đang lưu Vault và checkpoint");
        vaultWrites.forEach((id, row) -> store.saveVaultRecord(flow, id, row));
        snapshotWrites.forEach((id, row) -> store.saveSnapshot(flow, id, row));
        int sent = 0, failed = 0;
        if (request.isNotifyConflicts()) {
            if (!detected.isEmpty()) phase(request, executionId, "telegram", "NOTIFY", "Đang gửi cảnh báo xung đột");
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

    private void transformSheet(SheetDataResponse sheet, List<com.hybridflow.sync.dto.request.ColumnTransformConfig> configs) {
        Map<String, String> columns = new LinkedHashMap<>();
        sheet.getHeaders().forEach(column -> columns.put(column, ""));
        dataTransformerService.transformRow(columns, configs);
        sheet.setRows(dataTransformerService.transformRows(sheet.getRows(), configs));
    }

    private void mergeTransformWrites(SheetWritePlan plan, List<Map<String, String>> raw,
                                      List<Map<String, String>> clean, boolean writeBack) {
        Map<String, SheetCellChange> cells = new LinkedHashMap<>();
        if (writeBack) for (int row = 0; row < raw.size(); row++) {
            for (String column : plan.getHeaders()) {
                String before = raw.get(row).getOrDefault(column, "");
                String after = clean.get(row).getOrDefault(column, "");
                if (!Objects.equals(before, after)) cells.put(row + ":" + column,
                        new SheetCellChange(row, column, raw.get(row).get(plan.getIdColumn()), before, after));
            }
        }
        for (SheetCellChange cell : plan.getChanges()) {
            if (cell.getRowIndex() < raw.size()) {
                Map<String, String> original = raw.get(cell.getRowIndex());
                cell.setBefore(original.getOrDefault(cell.getColumn(), ""));
                cell.setRecordId(original.get(plan.getIdColumn()));
            }
            cells.put(cell.getRowIndex() + ":" + cell.getColumn(), cell);
        }
        plan.setChanges(cells.values().stream().filter(cell -> !Objects.equals(cell.getBefore(), cell.getAfter())).toList());
    }

    private void phase(RunSyncRequest request, String executionId, String role, String stage, String label) {
        if (request.getExecutionNodes() != null) phase(executionId, request.getExecutionNodes().getOrDefault(role, List.of()), stage, label);
    }

    private void phase(String executionId, List<String> nodes, String stage, String label) {
        if (executionId != null && !nodes.isEmpty()) history.phase(executionId, nodes, stage, label);
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
