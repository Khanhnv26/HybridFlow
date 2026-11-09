package com.hybridflow.sync.service.impl;

import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.common.util.ErrorContext;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.connector.google.util.SheetValueTypes;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.ColumnTransformConfig;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.request.SheetWriteTargetPlan;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;
import com.hybridflow.workspace.support.SheetWritePlanner;
import com.hybridflow.sync.dto.response.FieldConflict;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.engine.ThreeWayDiffEngine;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.model.SheetCellChange;
import com.hybridflow.sync.model.SheetWritePlan;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.service.DataTransformerService;
import com.hybridflow.sync.service.ExecutionHistoryService;
import com.hybridflow.sync.service.NotificationOutboxService;
import com.hybridflow.sync.service.NotificationTemplateService;
import com.hybridflow.sync.service.RuleEvaluationService;
import com.hybridflow.sync.service.SheetWriteService;
import com.hybridflow.sync.service.SyncConflictService;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.SyncStateService;
import com.hybridflow.sync.support.SyncJsonCodec;
import com.hybridflow.sync.util.FlowContextIds;
import com.hybridflow.sync.util.SheetEndpointUtils;
import com.hybridflow.sync.util.SheetRowUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SyncExecutionServiceImpl implements SyncExecutionService {
    private final GoogleSheetsService googleSheetsService;
    private final ThreeWayDiffEngine threeWayDiffEngine;
    private final SyncConflictService syncConflictService;
    private final SyncStateService store;
    private final ExecutionHistoryService history;
    private final SheetWriteService writes;
    private final DataTransformerService dataTransformerService;
    private final RuleEvaluationService ruleEvaluationService;
    private final NotificationTemplateService notificationTemplateService;
    private final NotificationOutboxService notificationOutboxService;
    private final SheetWritePlanner sheetWritePlanner;
    private final SyncJsonCodec codec;

    private record SheetToVaultResult(RunSyncResponse run, SheetWritePreviewResponse preview) {}

    @Override
    @Transactional(readOnly = true)
    public SheetWritePreviewResponse previewSheetWrite(RunSyncRequest request) {
        request.setBootstrapConfirmed(true);
        return executeSheetToVaultSync(request, request.getFlowId(), request.getIdColumn(), null, 0, true).preview();
    }

    @Override
    @Transactional
    public RunSyncResponse executeSync(RunSyncRequest request) {
        try (ErrorContext context = ErrorContext.open(ErrorContext.currentId())) {
            return executeWithContext(request);
        }
    }

    private RunSyncResponse executeWithContext(RunSyncRequest request) {
        long start = System.currentTimeMillis();
        require(request.getAccessToken(), "Access token");
        require(request.getFlowId(), "Flow ID");
        if (request.getFlowId().length() > 100) throw new ValidationException("Flow ID quá dài.");
        if (request.getConflictPolicy() == null || !Set.of("ASK_TELEGRAM", "SOURCE_WINS", "DESTINATION_WINS").contains(request.getConflictPolicy()))
            throw new ValidationException("Chính sách xung đột không hợp lệ.");
        normalizeLegacyNotifications(request);

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
            return executeSheetToVaultSync(request, flow, idColumn, executionId, start, false).run();
        } catch (RuntimeException ex) {
            history.fail(executionId, ex);
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
            endpoint.setColumnTypes(request.getColumnTypes());
            phase(executionId, endpoint.getNodeId() == null ? List.of() : List.of(endpoint.getNodeId()), "READ", "Đang đọc trang tính");
            SheetDataResponse sheet = googleSheetsService.readSheet(ReadSheetRequest.builder().accessToken(request.getAccessToken())
                    .spreadsheetId(endpoint.getSpreadsheetId()).sheetname(endpoint.getSheetName()).columnTypes(request.getColumnTypes()).build());
            endpoint.setSheetName(sheet.getSheetName());
            endpoint.setSpreadsheetTitle(sheet.getSpreadsheetTitle());
            if (!targets.add(SheetEndpointUtils.identity(endpoint)))
                throw new ValidationException("Không được nối hai khối vào cùng file và trang tính.");
            rawRows.add(sheet.getRows());
            if (endpoint.getTransforms() != null && !endpoint.getTransforms().isEmpty()) {
                phase(request, executionId, "transform:" + endpoint.getNodeId(), "TRANSFORM", "Đang chuẩn hóa " + endpoint.getLabel());
                transformSheet(sheet, endpoint.getTransforms());
            }
            data.add(sheet);
            indexes.add(SheetRowUtils.index(sheet, idColumn));
            plans.add(new SheetWritePlan(endpoint.getSpreadsheetId(), sheet.getSheetName(), idColumn, sheet.getHeaders(), new ArrayList<>()));
        }
        phase(request, executionId, "diff", "COMPARE", "Đang so khớp dữ liệu");
        if (request.getSyncColumns() == null || request.getSyncColumns().isEmpty())
            throw new ValidationException("Chọn rõ các cột được phép đồng bộ trong khối So khớp. Cột trùng tên không tự động được chia sẻ.");
        Set<String> columns = new TreeSet<>(request.getSyncColumns());
        columns.remove(idColumn);
        if (columns.isEmpty() || data.stream().anyMatch(sheet -> !sheet.getHeaders().containsAll(columns)))
            throw new ValidationException("Chọn ít nhất một cột dữ liệu có mặt trên tất cả trang tính.");

        Set<String> boundColumnsSet = new LinkedHashSet<>();
        boundColumnsSet.add(idColumn);
        boundColumnsSet.addAll(columns);
        List<String> boundColumns = new ArrayList<>(boundColumnsSet);
        store.bindMultiSheets(flow, endpoints, idColumn, boundColumns);

        validateColumnTypes(request, boundColumnsSet, data);
        validateNotifications(request, boundColumnsSet);

        boolean initial = !store.hasSnapshots(flow);
        if (initial && indexes.stream().anyMatch(index -> !index.isEmpty()) && !request.isBootstrapConfirmed()) {
            RunSyncResponse result = RunSyncResponse.builder().flowId(flow).executionId(executionId).status("AWAITING_CONFIRMATION")
                    .bootstrapRequired(true).sheetName(data.getFirst().getSheetName()).totalRowsProcessed(0).cleanRecordIds(List.of())
                    .conflicts(List.of()).comparedColumns(columns).latency((System.currentTimeMillis() - start) + " ms").build();
            completeAfterCommit(executionId, result);
            return result;
        }
        Set<String> allIds = new LinkedHashSet<>();
        indexes.forEach(index -> allIds.addAll(index.keySet()));
        if (!allIds.containsAll(store.getSnapshotRecordIds(flow)))
            throw new ValidationException("Có bản ghi đã bị xóa khỏi mọi trang tính. Khôi phục dòng hoặc tạo luồng mới để khởi tạo lại.");
        List<Integer> nextRows = new ArrayList<>(data.stream().map(sheet -> sheet.getRows().size()).toList());
        Map<String, Map<String, String>> checkpoints = new LinkedHashMap<>();
        List<String> clean = new ArrayList<>();
        List<SyncConflict> detected = new ArrayList<>();
        List<RecordChangeEvent> recordEvents = new ArrayList<>();

        for (String id : allIds) {
            Map<String, String> base = store.getSnapshot(flow, id);
            List<Integer> positions = new ArrayList<>();
            boolean missing = false;
            for (int i = 0; i < endpoints.size(); i++) {
                Integer position = indexes.get(i).get(id);
                if (position == null) {
                    if (base != null) throw new ValidationException("Bản ghi '" + id + "' đã mất khỏi một trang tính. Khôi phục dòng trước khi đồng bộ; hệ thống chưa tự lan truyền thao tác xóa.");
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
            Set<String> conflictedColumns = new LinkedHashSet<>();
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
                            throw new ValidationException("Bảng ưu tiên chưa có mã '" + id + "'. Không thể tự chọn giá trị cho dòng mới.");
                        winner = values.get(preferred);
                    } else {
                        if (missing) throw new ValidationException("Dòng mới '" + id + "' có nhiều giá trị khác nhau. Thống nhất dòng trên các bảng đang có trước khi tạo bản sao.");
                        detected.add(syncConflictService.saveMultiSheetConflict(request, endpoints, id, column, baseValue, changed, values));
                        unresolved = true;
                        conflictedColumns.add(column);
                        continue;
                    }
                }
                if (winner == null) winner = "";
                checkpoint.put(column, winner);
                for (int i = 0; i < endpoints.size(); i++) {
                    if (!Objects.equals(values.get(i), winner) || SheetRowUtils.requiresTypeWrite(data.get(i), positions.get(i), column, winner, request.getColumnTypes())) plans.get(i).getChanges().add(
                            new SheetCellChange(positions.get(i), column, id, values.get(i), winner));
                }
            }
            checkpoints.put(id, checkpoint);
            if (!unresolved) clean.add(id);
            if (!initial) addRecordEvent(recordEvents, id, base, checkpoint, columns, conflictedColumns);
        }
        for (SheetWritePlan plan : plans) plan.setColumnTypes(request.getColumnTypes());
        phase(request, executionId, "sheets", "WRITE", "Đang ghi và lưu checkpoint");
        for (int i = 0; i < plans.size(); i++) {
            mergeTransformWrites(plans.get(i), rawRows.get(i), data.get(i).getRows(), endpoints.get(i).isWriteBackCleanData());
        }
        writes.apply(request.getAccessToken(), plans);
        checkpoints.forEach((id, row) -> store.saveSnapshot(flow, id, row));
        syncConflictService.retainOpenConflicts(flow, detected.stream().map(SyncConflict::getId).toList());

        int queued = enqueueNotifications(request, flow, executionId, recordEvents, columns, initial ? List.of() : detected);
        int sent = 0, failed = 0;
        RunSyncResponse result = RunSyncResponse.builder().flowId(flow).executionId(executionId).sheetName(data.getFirst().getSheetName())
                .status(detected.isEmpty() ? "SUCCESS" : "CONFLICT").totalRowsProcessed(allIds.size()).cleanRecordIds(clean)
                .conflicts(detected).comparedColumns(columns).notificationsSent(sent).notificationsFailed(failed)
                .notificationsQueued(queued)
                .latency((System.currentTimeMillis() - start) + " ms").build();
        completeAfterCommit(executionId, result);
        return result;
    }

    private SheetToVaultResult executeSheetToVaultSync(
            RunSyncRequest request,
            String flow,
            String idColumn,
            String executionId,
            long start,
            boolean previewOnly
    ) {
        require(request.getSpreadsheetId(), "Spreadsheet ID");
        require(request.getStorageName(), "Vùng lưu trữ");
        SheetWriteTargetPlan target = request.getSheetWriteTargetPlan();
        if (!previewOnly) {
            Set<String> files = new TreeSet<>();
            files.add(request.getSpreadsheetId());
            if (target != null) files.add(target.getTargetSpreadSheetId());
            files.forEach(file -> store.lock("sheet:" + file));
            phase(request, executionId, "sheets", "RECOVER", "Đang kiểm tra lần ghi trước");
            writes.recover(request.getAccessToken(), List.copyOf(files));
        }
        phase(request, executionId, "sheets", "READ", "Đang đọc trang tính");
        SheetDataResponse sheet = googleSheetsService.readSheet(ReadSheetRequest.builder()
                .accessToken(request.getAccessToken()).spreadsheetId(request.getSpreadsheetId())
                .sheetname(request.getSheetName()).columnTypes(request.getColumnTypes()).build());
        List<Map<String, String>> rawRows = sheet.getRows();
        if (request.getTransforms() != null && !request.getTransforms().isEmpty()) {
            phase(request, executionId, "transforms", "TRANSFORM", "Đang chuẩn hóa dữ liệu");
            transformSheet(sheet, request.getTransforms());
        }
        phase(request, executionId, "diff", "COMPARE", "Đang so khớp dữ liệu");
        Map<String, Integer> index = SheetRowUtils.index(sheet, idColumn);
        Set<String> columns = new LinkedHashSet<>(request.getSyncColumns() == null || request.getSyncColumns().isEmpty()
                ? sheet.getHeaders() : request.getSyncColumns());
        if (!sheet.getHeaders().containsAll(columns)) throw new ValidationException("Cột đồng bộ không tồn tại trong Sheet.");
        columns.remove(idColumn);
        if (columns.isEmpty()) throw new ValidationException("Cần ít nhất một cột dữ liệu ngoài cột khóa.");

        Set<String> boundColumnsSet = new LinkedHashSet<>();
        boundColumnsSet.add(idColumn);
        boundColumnsSet.addAll(columns);
        List<String> boundColumns = new ArrayList<>(boundColumnsSet);
        validateColumnTypes(request, boundColumnsSet, List.of(sheet));
        validateNotifications(request, boundColumnsSet);

        boolean initial = !store.hasSnapshots(flow);
        if (initial && !index.isEmpty() && !request.isBootstrapConfirmed()) {
            RunSyncResponse result = RunSyncResponse.builder().flowId(flow).executionId(executionId).status("AWAITING_CONFIRMATION")
                    .bootstrapRequired(true).sheetName(sheet.getSheetName()).totalRowsProcessed(0)
                    .cleanRecordIds(List.of()).conflicts(List.of()).comparedColumns(columns)
                    .latency((System.currentTimeMillis() - start) + " ms").build();
            store.bind(flow, request.getSpreadsheetId(), sheet.getSheetName(), idColumn, sheet.getHeaders(), request.getStorageName());
            completeAfterCommit(executionId, result);
            return new SheetToVaultResult(result, null);
        }
        for (Map<String, String> old : store.getVaultRecords(flow)) {
            if (!index.containsKey(old.get(idColumn))) throw new ValidationException(
                    "Bản ghi " + old.get(idColumn) + " đã bị xóa khỏi Sheet. Khôi phục dòng hoặc tạo luồng mới để khởi tạo lại.");
        }
        Map<String, Map<String, String>> vaultWrites = new LinkedHashMap<>();
        Map<String, Map<String, String>> snapshotWrites = new LinkedHashMap<>();
        Map<String, String> sheetWrites = new LinkedHashMap<>();
        Set<String> conflictedCells = new HashSet<>();
        if (request.isWriteBackCleanData()) for (int row = 0; row < rawRows.size(); row++) {
            for (String column : sheet.getHeaders()) {
                String value = sheet.getRows().get(row).getOrDefault(column, "");
                if (!Objects.equals(rawRows.get(row).getOrDefault(column, ""), value))
                    sheetWrites.put(SheetRowUtils.range(sheet, row, column), value);
            }
        }
        List<String> clean = new ArrayList<>();
        List<Map<String, String>> resolvedRows = new ArrayList<>();
        Map<Integer, Integer> sourceRowNumbers = new LinkedHashMap<>();
        List<SyncConflict> detected = new ArrayList<>();
        List<RecordChangeEvent> recordEvents = new ArrayList<>();

        for (Map.Entry<String, Integer> entry : index.entrySet()) {
            String id = entry.getKey();
            Map<String, String> rowA = sheet.getRows().get(entry.getValue());
            Map<String, String> base = store.getSnapshot(flow, id);
            Map<String, String> rowB = store.getVaultRecord(flow, id);
            if (base == null) {
                if (rowB != null) throw new ValidationException("Vault có dữ liệu nhưng thiếu snapshot cho bản ghi " + id);
                vaultWrites.put(id, new LinkedHashMap<>(rowA));
                snapshotWrites.put(id, new LinkedHashMap<>(rowA));
                clean.add(id);
                sourceRowNumbers.put(resolvedRows.size(), entry.getValue() + 2);
                resolvedRows.add(rowA);
                if (!initial) {
                    recordEvents.add(RecordChangeEvent.builder()
                            .recordId(id)
                            .kind("CREATED")
                            .before(Collections.emptyMap())
                            .after(rowA)
                            .changedColumns(columns)
                            .conflictedColumns(Collections.emptySet())
                            .build());
                }
                continue;
            }
            if (rowB == null) throw new ValidationException("Thiếu bản ghi Vault: " + id);
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
            for (String column : unresolved) conflictedCells.add(SheetRowUtils.range(sheet, entry.getValue(), column));
            SyncDiffResult openDiff = new SyncDiffResult(id);
            for (FieldConflict conflict : diff.getConflicts()) {
                if (unresolved.contains(conflict.getColumn())) openDiff.addConflict(conflict.getColumn(),
                        conflict.getBaseValue(), conflict.getValueA(), conflict.getValueB());
            }
            if (!previewOnly) detected.addAll(syncConflictService.saveConflicts(openDiff, request, sheet.getSheetName()));
            updatesA.forEach((column, value) -> sheetWrites.put(SheetRowUtils.range(sheet, entry.getValue(), column), value));
            Map<String, String> checkpoint = new LinkedHashMap<>(base);
            for (String column : columns) {
                if (!unresolved.contains(column)) checkpoint.put(column, merged.get(column));
            }
            vaultWrites.put(id, merged);
            snapshotWrites.put(id, checkpoint);
            if (unresolved.isEmpty()) {
                clean.add(id);
                Map<String, String> resolved = new LinkedHashMap<>(rowA);
                resolved.putAll(updatesA);
                sourceRowNumbers.put(resolvedRows.size(), entry.getValue() + 2);
                resolvedRows.add(resolved);
            }
            if (!initial) addRecordEvent(recordEvents, id, base, checkpoint, columns, unresolved);
        }
        if (request.getColumnTypes() != null) for (Map.Entry<String, Integer> row : index.entrySet()) {
            for (String column : request.getColumnTypes().keySet()) {
                String range = SheetRowUtils.range(sheet, row.getValue(), column);
                String value = snapshotWrites.get(row.getKey()).getOrDefault(column, "");
                if (!conflictedCells.contains(range) && SheetRowUtils.requiresTypeWrite(sheet, row.getValue(), column, value, request.getColumnTypes()))
                    sheetWrites.putIfAbsent(range, value);
            }
        }
        phase(request, executionId, "sheets", "WRITE", "Đang đối soát và ghi trang tính");
        List<SheetCellChange> changes = new ArrayList<>();
        for (int row = 0; row < rawRows.size(); row++) for (String column : sheet.getHeaders()) {
            String range = SheetRowUtils.range(sheet, row, column);
            if (sheetWrites.containsKey(range) && (!Objects.equals(rawRows.get(row).getOrDefault(column, ""), sheetWrites.get(range))
                    || SheetRowUtils.requiresTypeWrite(sheet, row, column, sheetWrites.get(range), request.getColumnTypes())))
                changes.add(new SheetCellChange(row, column, rawRows.get(row).get(idColumn), rawRows.get(row).getOrDefault(column, ""), sheetWrites.get(range)));
        }
        List<SheetWritePlan> plans = new ArrayList<>();
        plans.add(new SheetWritePlan(request.getSpreadsheetId(), sheet.getSheetName(), idColumn,
                sheet.getHeaders(), changes, request.getColumnTypes()));
        int targetCellsUpdated = 0;
        int targetRowsUpdated = 0;
        int targetRowsSkipped = 0;
        if (target != null) {
            SheetDataResponse liveTarget = googleSheetsService.readSheet(ReadSheetRequest.builder()
                    .accessToken(request.getAccessToken())
                    .spreadsheetId(target.getTargetSpreadSheetId())
                    .sheetname(target.getTargetSheetName())
                    .build());
            if (request.getSpreadsheetId().equals(target.getTargetSpreadSheetId())
                    && sheet.getSheetName().equals(liveTarget.getSheetName())) {
                throw new ValidationException("Khối Ghi về bảng tính cần dùng tab khác tab nguồn.");
            }
            SheetWritePreviewResponse preview = sheetWritePlanner.plan(resolvedRows, sheet.getHeaders(), liveTarget,
                    target.getSourceKeyColumn(), target.getTargetKeyColumn(), target.getColumnMappings(), sourceRowNumbers);
            if (!preview.isValid()) {
                if (previewOnly) return new SheetToVaultResult(null, preview);
                if (request.getSheetWritePreviewToken() != null) throw stalePreview();
                throw new ValidationException(String.join("; ", preview.getErrors()));
            }

            List<SheetCellChange> targetChanges = preview.getChanges().stream()
                    .map(cell -> new SheetCellChange(cell.getTargetRowIndex(), cell.getTargetColumn(), cell.getKey(),
                            cell.getCurrentValue(), cell.getNewValue()))
                    .toList();
            plans.add(new SheetWritePlan(target.getTargetSpreadSheetId(), liveTarget.getSheetName(),
                    target.getTargetKeyColumn(), liveTarget.getHeaders(), targetChanges, Map.of()));

            if (previewOnly || request.getSheetWritePreviewToken() != null) {
                String fingerprint = codec.encode(List.of(flow, request.getConflictPolicy(), target.getSourceKeyColumn(),
                        target.getColumnMappings(), plans, preview.getUnmatchedRows(), preview.getMissingSourceKeyRows()));
                String token = FlowContextIds.scoped(request.getWorkspaceId(), request.getWorkflowId(), fingerprint);
                if (previewOnly) return new SheetToVaultResult(null, preview.toBuilder().previewToken(token).build());
                if (!token.equals(request.getSheetWritePreviewToken())) throw stalePreview();
            }

            targetCellsUpdated = targetChanges.size();
            targetRowsUpdated = (int) targetChanges.stream().map(SheetCellChange::getRowIndex).distinct().count();
            targetRowsSkipped = preview.getUnmatchedRows().size() + preview.getMissingSourceKeyRows().size();
            phase(request, executionId, "sheetWrite", "WRITE", "Đang ghi về bảng tính đích");
        }
        store.bind(flow, request.getSpreadsheetId(), sheet.getSheetName(), idColumn, sheet.getHeaders(), request.getStorageName());
        writes.apply(request.getAccessToken(), plans);
        phase(request, executionId, "storage", "WRITE", "Đang lưu Vault và checkpoint");
        vaultWrites.forEach((id, row) -> store.saveVaultRecord(flow, id, row));
        snapshotWrites.forEach((id, row) -> store.saveSnapshot(flow, id, row));

        int queued = enqueueNotifications(request, flow, executionId, recordEvents, columns, initial ? List.of() : detected);
        int sent = 0, failed = 0;
        RunSyncResponse result = RunSyncResponse.builder().flowId(flow).sheetName(sheet.getSheetName()).executionId(executionId)
                .status(detected.isEmpty() ? "SUCCESS" : "CONFLICT").totalRowsProcessed(index.size())
                .cleanRecordIds(clean).conflicts(detected).comparedColumns(columns)
                .notificationsSent(sent).notificationsFailed(failed).notificationsQueued(queued)
                .targetCellsUpdated(targetCellsUpdated)
                .targetRowsUpdated(targetRowsUpdated)
                .targetRowsSkipped(targetRowsSkipped)
                .latency((System.currentTimeMillis() - start) + " ms").build();
        completeAfterCommit(executionId, result);
        return new SheetToVaultResult(result, null);
    }

    private ApplicationException stalePreview() {
        return new ApplicationException(ErrorCode.STATE_CONFLICT, "Dữ liệu đã thay đổi. Xem trước lại trước khi áp dụng.");
    }

    private void validateColumnTypes(RunSyncRequest request, Set<String> columns, List<SheetDataResponse> sheets) {
        SheetValueTypes.validate(request.getColumnTypes(), columns, request.getIdColumn());
        if (request.getColumnTypes() == null || request.getColumnTypes().isEmpty()) return;
        for (SheetDataResponse sheet : sheets) {
            List<Map<String, String>> normalized = new ArrayList<>();
            for (Map<String, String> row : sheet.getRows()) {
                Map<String, String> copy = new LinkedHashMap<>(row);
                request.getColumnTypes().forEach((column, type) -> copy.put(column, SheetValueTypes.canonical(row.getOrDefault(column, ""), type)));
                normalized.add(copy);
            }
            sheet.setRows(normalized);
        }
    }

    private void validateNotifications(RunSyncRequest request, Set<String> columns) {
        ruleEvaluationService.validate(request.getRouters(), request.getActions(), columns, request.getColumnTypes());
        Set<String> actionIds = new HashSet<>();
        if (request.getActions() != null) {
            for (ActionPlan action : request.getActions()) {
                actionIds.add(action.getNodeId());
                notificationTemplateService.validateTemplate(action.getRecordTemplate(), columns);
                notificationTemplateService.validateConflictTemplate(action.getConflictTemplate());
            }
        }
        if (request.getConflictActionIds() != null && !actionIds.containsAll(request.getConflictActionIds()))
            throw new ValidationException("Đích cảnh báo xung đột không tồn tại.");
    }

    private void normalizeLegacyNotifications(RunSyncRequest request) {
        if (!request.isNotifyConflicts() || (request.getConflictActionIds() != null && !request.getConflictActionIds().isEmpty())) return;
        require(request.getChatId(), "Telegram Chat ID");
        String actionId = "legacy-" + UUID.nameUUIDFromBytes(request.getFlowId().getBytes(StandardCharsets.UTF_8));
        List<ActionPlan> actions = request.getActions() == null ? new ArrayList<>() : new ArrayList<>(request.getActions());
        actions.add(ActionPlan.builder().nodeId(actionId).channel("TELEGRAM").chatId(request.getChatId()).build());
        request.setActions(actions);
        request.setConflictActionIds(List.of(actionId));
    }

    private void addRecordEvent(List<RecordChangeEvent> events, String id, Map<String, String> before,
                                Map<String, String> after, Set<String> columns, Set<String> conflictedColumns) {
        Set<String> changed = new LinkedHashSet<>();
        for (String column : columns) {
            if (!conflictedColumns.contains(column) && (before == null
                    || !Objects.equals(before.getOrDefault(column, ""), after.getOrDefault(column, "")))) changed.add(column);
        }
        if (before == null || !changed.isEmpty()) events.add(RecordChangeEvent.builder().recordId(id)
                .kind(before == null ? "CREATED" : "UPDATED").before(before == null ? Map.of() : new LinkedHashMap<>(before))
                .after(new LinkedHashMap<>(after)).changedColumns(changed)
                .conflictedColumns(new LinkedHashSet<>(conflictedColumns)).build());
    }

    private int enqueueNotifications(RunSyncRequest request, String flow, String executionId,
                                     List<RecordChangeEvent> events, Set<String> columns, List<SyncConflict> conflicts) {
        if (request.getRouters() != null && !events.isEmpty()) {
            for (RouterPlan router : request.getRouters())
                phase(request, executionId, "router:" + router.getNodeId(), "ROUTE", "Đang kiểm tra điều kiện rẽ nhánh");
        }
        for (RecordChangeEvent event : events) {
            event.setRevision(store.getSnapshotRevision(flow, event.getRecordId()));
        }
        int queued = notificationOutboxService.enqueue(flow, executionId, request.getRouters(), request.getActions(),
                events, columns, request.getConflictActionIds(), conflicts);
        if (queued > 0 && request.getActions() != null) {
            for (ActionPlan action : request.getActions()) {
                boolean recordMatched = request.getRouters() != null && request.getRouters().stream().anyMatch(router ->
                        router.getActionNodeIds() != null && router.getActionNodeIds().contains(action.getNodeId())
                                && events.stream().anyMatch(event -> ruleEvaluationService.matches(router, event)));
                boolean conflictMatched = !conflicts.isEmpty() && request.getConflictActionIds() != null
                        && request.getConflictActionIds().contains(action.getNodeId());
                if (recordMatched || conflictMatched)
                    phase(request, executionId, "action:" + action.getNodeId(), "NOTIFY", "Đã xếp hàng thông báo");
            }
        }
        return queued;
    }

    private void transformSheet(SheetDataResponse sheet, List<ColumnTransformConfig> configs) {
        Map<String, String> columns = new LinkedHashMap<>();
        sheet.getHeaders().forEach(column -> columns.put(column, ""));
        for (ColumnTransformConfig config : configs) {
            if (config != null && !columns.containsKey(config.getColumnName()))
                throw new ValidationException("Trang tính '" + (sheet.getSpreadsheetTitle() == null ? sheet.getSpreadsheetId() : sheet.getSpreadsheetTitle())
                        + " / " + sheet.getSheetName() + "' thiếu cột chuẩn hóa: " + config.getColumnName());
        }
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
        plan.setChanges(cells.values().stream().filter(cell -> !Objects.equals(cell.getBefore(), cell.getAfter())
                || plan.getColumnTypes() != null && plan.getColumnTypes().containsKey(cell.getColumn())).toList());
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
        String correlationId = ErrorContext.currentId();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                history.finish(executionId, result.getStatus(), result, null);
            }
            @Override public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    try (ErrorContext context = ErrorContext.open(correlationId)) {
                        history.fail(executionId, new ApplicationException(ErrorCode.INTERNAL_ERROR,
                                "Giao dịch database không hoàn tất. Chạy lại đối soát dữ liệu."));
                    }
                }
            }
        });
    }

    private static void require(String value, String name) {
        if (value == null || value.isBlank() || value.equals("ya29.mock"))
            throw new ValidationException(name + " không được để trống hoặc dùng dữ liệu giả.");
    }
}
