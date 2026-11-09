package com.hybridflow.sync.dto.request;

import com.hybridflow.workspace.dto.request.SheetWritePreviewRequest;
import lombok.*;

import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SheetWriteTargetPlan {
    private String nodeId;
    private String targetSpreadSheetId;
    private String targetSheetName;
    private String sourceKeyColumn;
    private String targetKeyColumn;
    private List<SheetWritePreviewRequest.ColumnMappingItem> columnMappings;
}
