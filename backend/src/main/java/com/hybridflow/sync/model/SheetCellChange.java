package com.hybridflow.sync.model;
import lombok.*;
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class SheetCellChange {
    private int rowIndex;
    private String column;
    private String recordId;
    private String before;
    private String after;
}
