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
    private String sheetName;

}
