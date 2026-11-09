package com.hybridflow.workspace.support;

import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.workspace.dto.request.SheetWritePreviewRequest;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
public class SheetWritePlanner {

    public SheetWritePreviewResponse plan(List<Map<String, String>> sourceRows,
                                          List<String> sourceHeaders,
                                          SheetDataResponse targetSheet,
                                          String sourceKeyColumn,
                                          String targetKeyColumn,
                                          List<SheetWritePreviewRequest.ColumnMappingItem> columnMappings) {
        return plan(sourceRows, sourceHeaders, targetSheet, sourceKeyColumn, targetKeyColumn, columnMappings, Map.of());
    }

    public SheetWritePreviewResponse plan(List<Map<String, String>> sourceRows,
                                          List<String> sourceHeaders,
                                          SheetDataResponse targetSheet,
                                          String sourceKeyColumn,
                                          String targetKeyColumn,
                                          List<SheetWritePreviewRequest.ColumnMappingItem> columnMappings,
                                          Map<Integer, Integer> sourceRowNumbers) {
        List<String> errors = new ArrayList<>();
        List<String> safeSourceHeaders = sourceHeaders != null ? sourceHeaders : List.of();
        List<String> targetHeaders = (targetSheet != null && targetSheet.getHeaders() != null)
                ? targetSheet.getHeaders()
                : List.of();
        List<Map<String, String>> safeSourceRows = sourceRows != null ? sourceRows : List.of();
        List<Map<String, String>> targetRows = (targetSheet != null && targetSheet.getRows() != null)
                ? targetSheet.getRows()
                : List.of();
        List<SheetWritePreviewRequest.ColumnMappingItem> safeColumnMappings = columnMappings != null
                ? columnMappings
                : List.of();

        if (sourceKeyColumn == null || !safeSourceHeaders.contains(sourceKeyColumn)) {
            errors.add("Cột khóa nguồn '" + sourceKeyColumn + "' không còn tồn tại trên bảng tính nguồn.");
        }

        if (targetKeyColumn == null || !targetHeaders.contains(targetKeyColumn)) {
            errors.add("Cột khóa đích '" + targetKeyColumn + "' không còn tồn tại trên bảng tính đích.");
        }

        Set<String> seenTargetCols = new LinkedHashSet<>();

        for (SheetWritePreviewRequest.ColumnMappingItem mapping : safeColumnMappings) {
            if (mapping == null) {
                continue;
            }
            String sourceCol = mapping.getSourceColumn();
            String targetCol = mapping.getTargetColumn();

            if (sourceCol == null || !safeSourceHeaders.contains(sourceCol)) {
                errors.add("Cột nguồn '" + sourceCol + "' không còn tồn tại trên bảng tính nguồn.");
            }

            if (targetCol == null || !targetHeaders.contains(targetCol)) {
                errors.add("Cột đích '" + targetCol + "' không còn tồn tại trên bảng tính đích.");
            }

            if (targetCol != null && !seenTargetCols.add(targetCol)) {
                errors.add("Cột đích '" + targetCol + "' được ánh xạ nhiều lần.");
            }

            if (targetKeyColumn != null && targetKeyColumn.equals(targetCol)) {
                errors.add("Không được ánh xạ ghi đè vào cột khóa đích '" + targetCol + "'.");
            }
        }

        Map<String, List<Integer>> targetKeyToRows = new LinkedHashMap<>();

        if (targetKeyColumn != null) {
            for (int i = 0; i < targetRows.size(); i++) {
                Map<String, String> row = targetRows.get(i);
                String rawKey = row != null ? row.get(targetKeyColumn) : null;
                String key = rawKey != null ? rawKey.trim() : "";
                if (!key.isEmpty()) {
                    targetKeyToRows.computeIfAbsent(key, k -> new ArrayList<>()).add(i);
                }
            }
        }

        List<SheetWritePreviewResponse.DuplicateKeyItem> duplicateKeyItems = new ArrayList<>();
        for (Map.Entry<String, List<Integer>> entry : targetKeyToRows.entrySet()) {
            if (entry.getValue().size() > 1) {
                List<Integer> rowNumbers = entry.getValue().stream().map(i -> i + 2).toList();
                duplicateKeyItems.add(SheetWritePreviewResponse.DuplicateKeyItem.builder()
                        .key(entry.getKey())
                        .targetRowNumbers(rowNumbers)
                        .build());
            }
        }

        if (!duplicateKeyItems.isEmpty()) {
            errors.add("Bảng tính đích có " + duplicateKeyItems.size() + " mã khóa bị trùng lặp.");
        }

        if (!errors.isEmpty()) {
            return SheetWritePreviewResponse.builder()
                    .valid(false)
                    .errors(errors)
                    .changes(List.of())
                    .missingSourceKeyRows(List.of())
                    .duplicateTargetKeys(duplicateKeyItems)
                    .unmatchedRows(List.of())
                    .build();
        }

        List<SheetWritePreviewResponse.CellChangePreview> changes = new ArrayList<>();
        List<SheetWritePreviewResponse.UnmatchedRowItem> unmatchedRows = new ArrayList<>();
        List<Integer> missingSourceKeyRows = new ArrayList<>();
        Map<String, Integer> firstSourceRows = new HashMap<>();

        for (int i = 0; i < safeSourceRows.size(); i++) {
            int rowNumber = sourceRowNumbers.getOrDefault(i, i + 2);
            Map<String, String> sRow = safeSourceRows.get(i);
            String rawKey = sRow != null && sourceKeyColumn != null ? sRow.get(sourceKeyColumn) : null;
            String key = rawKey != null ? rawKey.trim() : "";

            if (key.isEmpty()) {
                missingSourceKeyRows.add(rowNumber);
                continue;
            }

            Integer firstRow = firstSourceRows.putIfAbsent(key, rowNumber);
            if (firstRow != null) {
                errors.add("Khóa nguồn '" + key + "' bị trùng ở dòng " + firstRow + " và " + rowNumber + ".");
                continue;
            }

            List<Integer> matchedIndices = targetKeyToRows.get(key);

            if (matchedIndices == null || matchedIndices.isEmpty()) {
                unmatchedRows.add(SheetWritePreviewResponse.UnmatchedRowItem.builder()
                        .key(key)
                        .sourceRowNumber(rowNumber)
                        .build());
                continue;
            }

            int targetIndex = matchedIndices.get(0);
            Map<String, String> tRow = targetRows.get(targetIndex);
            for (SheetWritePreviewRequest.ColumnMappingItem mapping : safeColumnMappings) {
                if (mapping == null) {
                    continue;
                }
                String currentVal = (tRow != null && mapping.getTargetColumn() != null)
                        ? Optional.ofNullable(tRow.get(mapping.getTargetColumn())).orElse("")
                        : "";
                String newVal = (sRow != null && mapping.getSourceColumn() != null)
                        ? Optional.ofNullable(sRow.get(mapping.getSourceColumn())).orElse("")
                        : "";

                if (!Objects.equals(currentVal, newVal)) {
                    changes.add(SheetWritePreviewResponse.CellChangePreview.builder()
                            .key(key)
                            .targetRowNumber(targetIndex + 2)
                            .targetRowIndex(targetIndex)
                            .sourceColumn(mapping.getSourceColumn())
                            .targetColumn(mapping.getTargetColumn())
                            .currentValue(currentVal)
                            .newValue(newVal)
                            .build());
                }
            }
        }

        return SheetWritePreviewResponse.builder()
                .valid(errors.isEmpty())
                .errors(errors)
                .changes(errors.isEmpty() ? changes : List.of())
                .missingSourceKeyRows(missingSourceKeyRows)
                .duplicateTargetKeys(duplicateKeyItems)
                .unmatchedRows(unmatchedRows)
                .build();
    }
}
