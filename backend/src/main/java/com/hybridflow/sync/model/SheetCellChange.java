package com.hybridflow.sync.model;
import lombok.*;
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class SheetCellChange {
    private int rowIndex;
    private String column;
    private String recordId;
    private String before;
    private String after;
    private String beforeValueType;
    private String beforeRawValue;

    public SheetCellChange(int rowIndex, String column, String recordId, String before, String after) {
        this(rowIndex, column, recordId, before, after, null, null);
    }
}
