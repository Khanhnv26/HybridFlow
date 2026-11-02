package com.hybridflow.sync.model;
import lombok.*;
import java.util.List;
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class SheetWritePlan {
    private String spreadsheetId;
    private String sheetName;
    private String idColumn;
    private List<String> headers;
    private List<SheetCellChange> changes;
}
