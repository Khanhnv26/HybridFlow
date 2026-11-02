package com.hybridflow.sync.service.impl;


import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.engine.ThreeWayDiffEngine;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.service.SyncConflictService;
import com.hybridflow.sync.service.SyncExecutionService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SyncExecutionServiceImpl implements SyncExecutionService {

    private final GoogleSheetsService googleSheetsService;
    private final ThreeWayDiffEngine threeWayDiffEngine;
    private final SyncConflictService syncConflictService;
    private final TelegramNotificationService telegramNotificationService;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    private static final TypeReference<Map<String, String>> MAP_TYPE_REF = new TypeReference<>() {};

    @Override
    @Transactional
    public RunSyncResponse executeSync(RunSyncRequest request) {
        long startTime = System.currentTimeMillis();

        if(request.getAccessToken() == null || request.getAccessToken().isBlank()) {
            throw new IllegalArgumentException("Access token không được để trống.");
        }

        if(request.getSpreadsheetId() == null || request.getSpreadsheetId().isBlank()) {
            throw new IllegalArgumentException("Spreadsheet ID không được để trống.");
        }

        String flowId = (request.getFlowId() != null && !request.getFlowId().isBlank()) ? request.getFlowId() : "default_flow";
        String idColumn = (request.getIdColumn() != null && !request.getIdColumn().isBlank()) ? request.getIdColumn().trim() : "id";

        ReadSheetRequest readRequest = ReadSheetRequest.builder()
                .accessToken(request.getAccessToken())
                .spreadsheetId(request.getSpreadsheetId())
                .sheetname(request.getSheetName())
                .build();

        SheetDataResponse sheetResponse = googleSheetsService.readSheet(readRequest);

        List<Map<String, String>> rowsA = sheetResponse.getRows();
        List<String> headers = sheetResponse.getHeaders();

        if(headers == null || headers.isEmpty()) {
            return RunSyncResponse.builder()
                    .flowId(flowId)
                    .totalRowsProcessed(0)
                    .cleanRecordIds(List.of())
                    .conflicts(List.of())
                    .comparedColumns(Set.of())
                    .latency((System.currentTimeMillis() - startTime) + " ms")
                    .build();
        }

        Set<String> columnsToCompare;

        if (request.getSyncColumns() != null && !request.getSyncColumns().isEmpty()) {
            columnsToCompare = request.getSyncColumns().stream()
                    .filter(c -> !c.equalsIgnoreCase(idColumn))
                    .collect(Collectors.toSet());
        } else {
            columnsToCompare = headers.stream()
                    .filter(c -> !c.equalsIgnoreCase(idColumn))
                    .collect(Collectors.toSet());
        }

        List<String> cleanRecordIds = new ArrayList<>();
        List<SyncConflict> detectedConflicts = new ArrayList<>();

        for (Map<String, String> rowA : rowsA) {
            String recordId = rowA.get(idColumn);
            if (recordId == null || recordId.isBlank()) {
                continue;
            }

            Map<String, String> baseRow = queryDynamicRow("sync_snapshots", flowId, recordId);
            Map<String, String> rowB = queryDynamicRow("vault_records", flowId, recordId);

            if(baseRow == null) {
                upsertDynamicRow("sync_snapshots", flowId, recordId, rowA);
                upsertDynamicRow("vault_records", flowId, recordId, rowA);
                cleanRecordIds.add(recordId);
                continue;
            }

            SyncDiffResult diff = threeWayDiffEngine.compareRow(recordId, baseRow, rowA, rowB != null ? rowB : baseRow, columnsToCompare);

            if(diff.hasConflicts()) {
                List<SyncConflict> saved = syncConflictService.saveConflicts(diff);
                detectedConflicts.addAll(saved);

                for (SyncConflict conflict : saved) {
                    telegramNotificationService.sendConflictAlert(conflict);
                }

            } else {
                    Map<String, String> updatedVaultRow = new HashMap<>(rowB != null ? rowB : baseRow);
                    updatedVaultRow.putAll(diff.getUpdatesForB());
                    upsertDynamicRow("vault_records", flowId, recordId, updatedVaultRow);
                    upsertDynamicRow("sync_snapshots", flowId, recordId, updatedVaultRow);
                    cleanRecordIds.add(recordId);
                }
            }

        long latency = System.currentTimeMillis() - startTime;

        return RunSyncResponse.builder()
                .flowId(flowId)
                .totalRowsProcessed(rowsA.size())
                .cleanRecordIds(cleanRecordIds)
                .conflicts(detectedConflicts)
                .comparedColumns(columnsToCompare)
                .latency(latency + " ms")
                .build();
    }


    private Map<String, String> queryDynamicRow(String tableName, String flowId, String recordId) {
        String sql = "Select data from " + tableName + " where flow_id = ? and record_id = ?";
        List<String> rawJsonList = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("data"), flowId, recordId);

        if (rawJsonList.isEmpty() || rawJsonList.get(0) == null) {
            return null;
        }

        try {
            return objectMapper.readValue(rawJsonList.get(0), MAP_TYPE_REF);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi đọc dữ liệu JSONB từ bảng " + tableName + ": " + e.getMessage(), e);
        }
    }

    private void upsertDynamicRow(String tableName, String flowId, String recordId, Map<String, String> rowData) {
        try {
            String jsonData = objectMapper.writeValueAsString(rowData);

            String sql = """
                    INSERT INTO %s (flow_id, record_id, data, updated_at)
                    VALUES (?, ?, ?::jsonb, CURRENT_TIMESTAMP)
                    ON CONFLICT (flow_id, record_id) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
                    """.formatted(tableName);

            jdbcTemplate.update(sql, flowId, recordId, jsonData);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi ghi dữ liệu JSONB vào bảng " + tableName + ": " + e.getMessage(), e);
        }
    }
}
