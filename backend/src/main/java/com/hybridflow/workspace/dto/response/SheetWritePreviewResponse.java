package com.hybridflow.workspace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder(toBuilder = true)
@AllArgsConstructor
public class SheetWritePreviewResponse {
    private final boolean valid;
    private final String previewToken;
    private final List<String> errors;
    private final List<CellChangePreview> changes;
    private final List<UnmatchedRowItem> unmatchedRows;
    private final List<Integer> missingSourceKeyRows;
    private final List<DuplicateKeyItem> duplicateTargetKeys;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class CellChangePreview {
        private final String key;
        private final int targetRowNumber;
        private final int targetRowIndex;
        private final String sourceColumn;
        private final String targetColumn;
        private final String currentValue;
        private final String newValue;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UnmatchedRowItem {
        private final String key;
        private final int sourceRowNumber;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DuplicateKeyItem {
        private final String key;
        private final List<Integer> targetRowNumbers;
    }
}
