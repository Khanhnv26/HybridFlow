package com.hybridflow.sync.model;

import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class SyncFlowBinding {
    private final String flowId;
    private final String spreadsheetId;
    private final String sheetName;
    private final String idColumn;
    private final List<String> headers;
    private final String storageName;
    private final List<SheetEndpointRequest> endpoints;

    public SyncFlowBinding(
            String flowId,
            String spreadsheetId,
            String sheetName,
            String idColumn,
            List<String> headers,
            String storageName
    ) {
        this(flowId, spreadsheetId, sheetName, idColumn, headers, storageName, List.of());
    }
}
