package com.hybridflow.workspace.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SheetWritePreviewRequest {
    @NotBlank
    private String sourceSpreadSheetId;
    @NotBlank
    private String sourceSheetName;
    @NotBlank
    private String sourceKeyColumn;
    @NotBlank
    private String targetSpreadSheetId;
    @NotBlank
    private String targetSheetName;
    @NotBlank
    private String targetKeyColumn;
    @NotEmpty
    private List<ColumnMappingItem> columnMappings;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ColumnMappingItem {
        @NotBlank
        private String sourceColumn;
        @NotBlank
        private String targetColumn;
    }
}
