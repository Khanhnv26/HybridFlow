package com.hybridflow.sync.service.impl;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.response.FieldConflict;
import com.hybridflow.sync.dto.response.TelegramAlertResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.repository.SyncConflictRepository;
import com.hybridflow.sync.service.SyncConflictService;
import com.hybridflow.sync.service.SyncStateService;
import com.hybridflow.sync.support.SyncJsonCodec;
import com.hybridflow.sync.util.SheetRowUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@RequiredArgsConstructor
@Service
public class SyncConflictServiceImpl implements SyncConflictService {
    private final SyncConflictRepository repository;
    private final SyncStateService store;
    private final GoogleSheetsService sheets;
    private final TelegramNotificationService notifications;
    private final SyncJsonCodec codec;

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
        changedByValue.forEach((val, labels) -> candidates.put(String.join(", ", labels), val));
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
                        && Objects.equals(c.getCandidatesJson(), candidatesJson))
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
            throw new IllegalArgumentException("Cần kết nối Google để ghi giá trị đã chọn.");
        String flowId = repository.findFlowIdById(conflictId).orElseThrow(() ->
                new IllegalArgumentException("Xung đột không tồn tại hoặc thiếu nguồn dữ liệu. Chạy lại đồng bộ."));
        store.lock(flowId);
        // Reload after waiting for the flow lock so concurrent decisions cannot overwrite each other.
        SyncConflict conflict = repository.findLockedById(conflictId).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy xung đột."));
        if (!"OPEN".equals(conflict.getStatus())) throw new IllegalArgumentException("Xung đột đã được xử lý. Tải lại danh sách.");

        if (conflict.getEndpointsJson() != null && !conflict.getEndpointsJson().isBlank()) {
            List<SheetEndpointRequest> endpoints = codec.decodeEndpoints(conflict.getEndpointsJson());
            if (!endpoints.isEmpty()) {
                return resolveMultiSheetConflict(conflict, endpoints, value, accessToken);
            }
        }

        if (conflict.getSpreadsheetId() == null || conflict.getSheetName() == null)
            throw new IllegalArgumentException("Xung đột cũ thiếu nguồn dữ liệu. Chạy lại đồng bộ trước khi phê duyệt.");
        if (!Objects.equals(value, conflict.getValueA()) && !Objects.equals(value, conflict.getValueB()))
            throw new IllegalArgumentException("Chỉ được chọn một trong hai giá trị đang xung đột.");
        SheetDataResponse sheet = sheets.readSheet(ReadSheetRequest.builder().accessToken(accessToken)
                .spreadsheetId(conflict.getSpreadsheetId()).sheetname(conflict.getSheetName()).build());
        Map<String, Integer> index = SheetRowUtils.index(sheet, conflict.getIdColumn());
        Integer rowIndex = index.get(conflict.getRecordId());
        Map<String, String> vault = store.getVaultRecord(conflict.getFlowId(), conflict.getRecordId());
        Map<String, String> base = store.getSnapshot(conflict.getFlowId(), conflict.getRecordId());
        if (rowIndex == null || vault == null || base == null
                || !Objects.equals(sheet.getRows().get(rowIndex).get(conflict.getColumnName()), conflict.getValueA())
                || !Objects.equals(vault.get(conflict.getColumnName()), conflict.getValueB()))
            throw new IllegalArgumentException("Dữ liệu đã đổi từ lúc phát hiện xung đột. Chạy lại đồng bộ trước khi chọn.");
        Map<String, String> cells = new LinkedHashMap<>();
        cells.put(SheetRowUtils.range(sheet, rowIndex, conflict.getColumnName()), value);
        sheets.updateCells(accessToken, conflict.getSpreadsheetId(), cells);
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
        Map<String, String> candidates = codec.decodeCandidates(conflict.getCandidatesJson());
        Set<String> allowedValues = new HashSet<>(candidates.values());
        allowedValues.add(conflict.getValueA());
        allowedValues.add(conflict.getValueB());
        if (!allowedValues.contains(value)) {
            throw new IllegalArgumentException("Chỉ được chọn một trong các giá trị đang xung đột.");
        }

        Map<String, String> base = store.getSnapshot(conflict.getFlowId(), conflict.getRecordId());
        if (base == null) {
            base = new LinkedHashMap<>();
        } else {
            base = new LinkedHashMap<>(base);
        }

        for (SheetEndpointRequest ep : endpoints) {
            SheetDataResponse sheet = sheets.readSheet(ReadSheetRequest.builder()
                    .accessToken(accessToken)
                    .spreadsheetId(ep.getSpreadsheetId())
                    .sheetname(ep.getSheetName())
                    .build());
            Map<String, Integer> index = SheetRowUtils.index(sheet, conflict.getIdColumn());
            Integer rowIndex = index.get(conflict.getRecordId());
            if (rowIndex == null) {
                throw new IllegalArgumentException("Không tìm thấy bản ghi '" + conflict.getRecordId() + "' trên bảng " + ep.getLabel());
            }
            Map<String, String> cells = Map.of(SheetRowUtils.range(sheet, rowIndex, conflict.getColumnName()), value);
            sheets.updateCells(accessToken, ep.getSpreadsheetId(), cells);
        }

        base.put(conflict.getColumnName(), value);
        store.saveSnapshot(conflict.getFlowId(), conflict.getRecordId(), base);

        conflict.setResolvedValue(value);
        conflict.setStatus("RESOLVED");
        conflict.setResolvedAt(LocalDateTime.now());
        return repository.save(conflict);
    }

    @Override
    public TelegramAlertResponse resendTelegramAlert(Long conflictId, String chatId) {
        SyncConflict conflict = getConflictById(conflictId);
        if (!"OPEN".equals(conflict.getStatus())) {
            throw new IllegalArgumentException("Xung đột đã được xử lý.");
        }
        if (chatId == null || chatId.isBlank()) {
            throw new IllegalArgumentException("Cần Telegram Chat ID.");
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
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy xung đột: " + id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SyncConflict> getOpenConflicts(String flowId) {
        if (flowId == null || flowId.isBlank()) throw new IllegalArgumentException("Cần Flow ID.");
        return repository.findByFlowIdAndStatus(flowId, "OPEN");
    }
}
