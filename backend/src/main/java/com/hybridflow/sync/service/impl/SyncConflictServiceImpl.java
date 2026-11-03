package com.hybridflow.sync.service.impl;

import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.response.FieldConflict;
import com.hybridflow.sync.dto.response.TelegramAlertResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SheetCellChange;
import com.hybridflow.sync.model.SheetWritePlan;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.repository.SyncConflictRepository;
import com.hybridflow.sync.service.DataTransformerService;
import com.hybridflow.sync.service.SheetWriteService;
import com.hybridflow.sync.service.SyncConflictService;
import com.hybridflow.sync.service.SyncStateService;
import com.hybridflow.sync.support.SyncJsonCodec;
import com.hybridflow.sync.util.SheetEndpointUtils;
import com.hybridflow.sync.util.SheetRowUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

@RequiredArgsConstructor
@Service
public class SyncConflictServiceImpl implements SyncConflictService {
    private final SyncConflictRepository repository;
    private final SyncStateService store;
    private final GoogleSheetsService sheets;
    private final TelegramNotificationService notifications;
    private final SyncJsonCodec codec;
    private final SheetWriteService writes;
    private final DataTransformerService dataTransformerService;

    @Override
    @Transactional
    public List<SyncConflict> saveConflicts(SyncDiffResult diff, RunSyncRequest context, String sheetName) {
        List<SyncConflict> existing = repository.findByFlowIdAndStatus(context.getFlowId(), "OPEN").stream()
                .filter(c -> c.getRecordId().equals(diff.getRecordId())).toList();
        List<SyncConflict> result = new ArrayList<>();
        Set<Long> retained = new HashSet<>();
        for (FieldConflict field : diff.getConflicts()) {
            Optional<SyncConflict> match = existing.stream().filter(c -> c.getColumnName().equals(field.getColumn())
                    && Objects.equals(c.getValueA(), field.getValueA()) && Objects.equals(c.getValueB(), field.getValueB())
                    && Objects.equals(c.getBaseValue(), field.getBaseValue())).findFirst();
            if (match.isPresent()) {
                result.add(match.get());
                retained.add(match.get().getId());
            } else {
                result.add(repository.save(SyncConflict.builder().flowId(context.getFlowId())
                        .spreadsheetId(context.getSpreadsheetId()).sheetName(sheetName).idColumn(context.getIdColumn())
                        .recordId(diff.getRecordId()).columnName(field.getColumn()).baseValue(field.getBaseValue())
                        .endpointsJson((context.getTransforms() == null || context.getTransforms().isEmpty()) && (context.getColumnTypes() == null || context.getColumnTypes().isEmpty()) ? null : codec.encode(List.of(
                                SheetEndpointRequest.builder().spreadsheetId(context.getSpreadsheetId()).sheetName(sheetName)
                                        .columnTypes(context.getColumnTypes()).transforms(context.getTransforms()).writeBackCleanData(context.isWriteBackCleanData()).build())))
                        .valueA(field.getValueA()).valueB(field.getValueB()).status("OPEN").createdAt(LocalDateTime.now()).build()));
            }
        }
        for (SyncConflict old : existing) {
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
    public SyncConflict saveMultiSheetConflict(
            RunSyncRequest context,
            List<SheetEndpointRequest> endpoints,
            String recordId,
            String columnName,
            String baseValue,
            Map<String, List<String>> changedByValue,
            List<String> currentValuesPerSheet
    ) {
        Map<String, String> candidates = new LinkedHashMap<>();
        Map<String, String> observations = new LinkedHashMap<>();
        for (int i = 0; i < endpoints.size(); i++) {
            SheetEndpointRequest endpoint = endpoints.get(i);
            String current = currentValuesPerSheet.get(i);
            observations.put(SheetEndpointUtils.identity(endpoint), current);
            candidates.put((i + 1) + ". " + (endpoint.getLabel() == null ? endpoint.getSheetName() : endpoint.getLabel())
                    + " [" + endpoint.getSpreadsheetId() + " / " + endpoint.getSheetName() + "]", current);
        }
        String observationsJson = codec.encode(observations);
        String candidatesJson = codec.encode(candidates);
        String endpointsJson = codec.encode(endpoints);

        List<String> distinctChangedValues = new ArrayList<>(changedByValue.keySet());
        String valA = !distinctChangedValues.isEmpty() ? distinctChangedValues.get(0) : currentValuesPerSheet.get(0);
        String valB = distinctChangedValues.size() > 1 ? distinctChangedValues.get(1) : currentValuesPerSheet.get(1);

        List<SyncConflict> existing = repository.findByFlowIdAndStatus(context.getFlowId(), "OPEN").stream()
                .filter(c -> c.getRecordId().equals(recordId) && c.getColumnName().equals(columnName))
                .toList();

        Optional<SyncConflict> match = existing.stream()
                .filter(c -> Objects.equals(c.getBaseValue(), baseValue)
                        && Objects.equals(c.getValueA(), valA)
                        && Objects.equals(c.getValueB(), valB)
                        && c.getObservationsJson() != null
                        && Objects.equals(codec.decodeCandidates(c.getObservationsJson()), observations))
                .findFirst();

        for (SyncConflict old : existing) {
            if (match.isEmpty() || !Objects.equals(old.getId(), match.get().getId())) {
                old.setStatus("SUPERSEDED");
                old.setResolvedAt(LocalDateTime.now());
                repository.save(old);
            }
        }

        if (match.isPresent()) {
            return match.get();
        }

        SheetEndpointRequest first = endpoints.get(0);
        return repository.save(SyncConflict.builder()
                .flowId(context.getFlowId())
                .spreadsheetId(first.getSpreadsheetId())
                .sheetName(first.getSheetName())
                .idColumn(context.getIdColumn())
                .endpointsJson(endpointsJson)
                .candidatesJson(candidatesJson)
                .observationsJson(observationsJson)
                .recordId(recordId)
                .columnName(columnName)
                .baseValue(baseValue)
                .valueA(valA)
                .valueB(valB)
                .status("OPEN")
                .createdAt(LocalDateTime.now())
                .build());
    }

    @Override
    @Transactional
    public SyncConflict resolveConflict(Long conflictId, String value, String accessToken) {
        if (accessToken == null || accessToken.isBlank() || accessToken.equals("ya29.mock"))
            throw new ValidationException("Cần kết nối Google để ghi giá trị đã chọn.");
        String flowId = repository.findFlowIdById(conflictId).orElseThrow(() ->
                new ValidationException("Xung đột không tồn tại hoặc thiếu nguồn dữ liệu. Chạy lại đồng bộ."));
        store.lock(flowId);
        // Reload after waiting for the flow lock so concurrent decisions cannot overwrite each other.
        SyncConflict conflict = repository.findLockedById(conflictId).orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy xung đột."));
        if (!"OPEN".equals(conflict.getStatus())) throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Xung đột đã được xử lý. Tải lại danh sách.");

        List<SheetEndpointRequest> endpoints = List.of();
        if (conflict.getEndpointsJson() != null && !conflict.getEndpointsJson().isBlank()) {
            endpoints = codec.decodeEndpoints(conflict.getEndpointsJson());
            if (endpoints.size() >= 2) {
                return resolveMultiSheetConflict(conflict, endpoints, value, accessToken);
            }
        }

        if (conflict.getSpreadsheetId() == null || conflict.getSheetName() == null)
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Xung đột cũ thiếu nguồn dữ liệu. Chạy lại đồng bộ trước khi phê duyệt.");
        if (!Objects.equals(value, conflict.getValueA()) && !Objects.equals(value, conflict.getValueB()))
            throw new ValidationException("Chỉ được chọn một trong hai giá trị đang xung đột.");
        store.lock("sheet:" + conflict.getSpreadsheetId());
        writes.recover(accessToken, List.of(conflict.getSpreadsheetId()));
        Map<String, String> columnTypes = endpoints.isEmpty() || endpoints.getFirst().getColumnTypes() == null ? Map.of() : endpoints.getFirst().getColumnTypes();
        SheetDataResponse sheet = sheets.readSheet(ReadSheetRequest.builder().accessToken(accessToken)
                .spreadsheetId(conflict.getSpreadsheetId()).sheetname(conflict.getSheetName()).columnTypes(columnTypes).build());
        List<Map<String, String>> sourceRows = sheet.getRows();
        if (!endpoints.isEmpty() && endpoints.getFirst().getTransforms() != null)
            sheet.setRows(dataTransformerService.transformRows(sheet.getRows(), endpoints.getFirst().getTransforms()));
        Map<String, Integer> index = SheetRowUtils.index(sheet, conflict.getIdColumn());
        Integer rowIndex = index.get(conflict.getRecordId());
        Map<String, String> vault = store.getVaultRecord(conflict.getFlowId(), conflict.getRecordId());
        Map<String, String> base = store.getSnapshot(conflict.getFlowId(), conflict.getRecordId());
        if (rowIndex == null || vault == null || base == null
                || !Objects.equals(sheet.getRows().get(rowIndex).get(conflict.getColumnName()), conflict.getValueA())
                || !Objects.equals(vault.get(conflict.getColumnName()), conflict.getValueB()))
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Dữ liệu đã đổi từ lúc phát hiện xung đột. Chạy lại đồng bộ trước khi chọn.");
        Map<String, String> cells = new LinkedHashMap<>();
        cells.put(SheetRowUtils.range(sheet, rowIndex, conflict.getColumnName()), value);
        if (columnTypes.isEmpty()) sheets.updateCells(accessToken, conflict.getSpreadsheetId(), cells);
        else writes.apply(accessToken, List.of(new SheetWritePlan(conflict.getSpreadsheetId(), sheet.getSheetName(), conflict.getIdColumn(), sheet.getHeaders(),
                List.of(new SheetCellChange(rowIndex, conflict.getColumnName(), sourceRows.get(rowIndex).get(conflict.getIdColumn()), sourceRows.get(rowIndex).getOrDefault(conflict.getColumnName(), ""), value)), columnTypes)));
        vault = new LinkedHashMap<>(vault);
        base = new LinkedHashMap<>(base);
        vault.put(conflict.getColumnName(), value);
        base.put(conflict.getColumnName(), value);
        store.saveVaultRecord(conflict.getFlowId(), conflict.getRecordId(), vault);
        store.saveSnapshot(conflict.getFlowId(), conflict.getRecordId(), base);
        conflict.setResolvedValue(value);
        conflict.setStatus("RESOLVED");
        conflict.setResolvedAt(LocalDateTime.now());
        return repository.save(conflict);
    }

    private SyncConflict resolveMultiSheetConflict(
            SyncConflict conflict,
            List<SheetEndpointRequest> endpoints,
            String value,
            String accessToken
    ) {
        List<String> spreadsheetIds = endpoints.stream().map(SheetEndpointRequest::getSpreadsheetId).distinct().sorted().toList();
        spreadsheetIds.forEach(id -> store.lock("sheet:" + id));
        writes.recover(accessToken, spreadsheetIds);
        if (conflict.getObservationsJson() == null || conflict.getObservationsJson().isBlank())
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Xung đột cũ thiếu giá trị từng nguồn. Chạy lại đồng bộ trước khi chọn.");
        Map<String, String> observed = codec.decodeCandidates(conflict.getObservationsJson());
        if (!observed.values().contains(value))
            throw new ValidationException("Chỉ được chọn một trong các giá trị đang xung đột.");
        Map<String, String> base = store.getSnapshot(conflict.getFlowId(), conflict.getRecordId());
        base = base == null ? new LinkedHashMap<>() : new LinkedHashMap<>(base);
        base.put(conflict.getIdColumn(), conflict.getRecordId());
        List<SheetWritePlan> plans = new ArrayList<>();
        for (SheetEndpointRequest ep : endpoints) {
            SheetDataResponse sheet = sheets.readSheet(ReadSheetRequest.builder().accessToken(accessToken)
                    .spreadsheetId(ep.getSpreadsheetId()).sheetname(ep.getSheetName()).columnTypes(ep.getColumnTypes()).build());
            List<Map<String, String>> raw = sheet.getRows();
            if (ep.getTransforms() != null && !ep.getTransforms().isEmpty())
                sheet.setRows(dataTransformerService.transformRows(raw, ep.getTransforms()));
            Integer rowIndex = SheetRowUtils.index(sheet, conflict.getIdColumn()).get(conflict.getRecordId());
            String expected = observed.get(SheetEndpointUtils.identity(ep));
            if (rowIndex == null || expected == null || !sheet.getHeaders().contains(conflict.getColumnName())
                    || !Objects.equals(expected, sheet.getRows().get(rowIndex).getOrDefault(conflict.getColumnName(), "")))
                throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Dữ liệu đã đổi từ lúc phát hiện xung đột. Chạy lại đồng bộ trước khi chọn.");
            String rawValue = raw.get(rowIndex).getOrDefault(conflict.getColumnName(), "");
            List<SheetCellChange> changes = Objects.equals(rawValue, value) && !SheetRowUtils.requiresTypeWrite(sheet, rowIndex, conflict.getColumnName(), value, ep.getColumnTypes()) ? List.of() : List.of(
                    new SheetCellChange(rowIndex, conflict.getColumnName(), raw.get(rowIndex).get(conflict.getIdColumn()), rawValue, value));
            plans.add(new SheetWritePlan(ep.getSpreadsheetId(), sheet.getSheetName(), conflict.getIdColumn(), sheet.getHeaders(), changes, ep.getColumnTypes()));
        }
        writes.apply(accessToken, plans);

        base.put(conflict.getColumnName(), value);
        store.saveSnapshot(conflict.getFlowId(), conflict.getRecordId(), base);

        conflict.setResolvedValue(value);
        conflict.setStatus("RESOLVED");
        conflict.setResolvedAt(LocalDateTime.now());
        return repository.save(conflict);
    }

    @Override
    @Transactional
    public void retainOpenConflicts(String flowId, List<Long> retainedIds) {
        for (SyncConflict conflict : repository.findByFlowIdAndStatus(flowId, "OPEN")) {
            if (!retainedIds.contains(conflict.getId())) {
                conflict.setStatus("SUPERSEDED");
                conflict.setResolvedAt(LocalDateTime.now());
                repository.save(conflict);
            }
        }
    }

    @Override
    public TelegramAlertResponse resendTelegramAlert(Long conflictId, String chatId) {
        SyncConflict conflict = getConflictById(conflictId);
        if (!"OPEN".equals(conflict.getStatus())) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Xung đột đã được xử lý.");
        }
        if (chatId == null || chatId.isBlank()) {
            throw new ValidationException("Cần Telegram Chat ID.");
        }
        boolean sent = notifications.sendConflictAlert(conflict, chatId);
        return TelegramAlertResponse.builder()
                .id(conflictId)
                .success(sent)
                .message(sent ? "Đã gửi cảnh báo Telegram thành công!" : "Gửi Telegram thất bại!")
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public SyncConflict getConflictById(Long id) {
        return repository.findById(id).orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy xung đột: " + id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SyncConflict> getOpenConflicts(String flowId) {
        if (flowId == null || flowId.isBlank()) throw new ValidationException("Cần Flow ID.");
        return repository.findByFlowIdAndStatus(flowId, "OPEN");
    }
}
