package com.hybridflow.sync.dto.request;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode
public class SheetEndpointRequest {
    private String nodeId;
    private String label;
    private String spreadsheetId;
    private String spreadsheetTitle;
    private String sheetName;
    private java.util.List<ColumnTransformConfig> transforms;
    private boolean writeBackCleanData;

}
