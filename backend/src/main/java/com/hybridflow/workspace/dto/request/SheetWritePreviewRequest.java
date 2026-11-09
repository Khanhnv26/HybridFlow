package com.hybridflow.workspace.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SheetWritePreviewRequest {
    private String upstreamNodeId;
    private String sourceSpreadSheetId;
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
    private List<@NotNull @Valid ColumnMappingItem> columnMappings;

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
