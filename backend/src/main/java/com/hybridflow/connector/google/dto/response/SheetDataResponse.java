package com.hybridflow.connector.google.dto.response;

import lombok.*;

import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SheetDataResponse {

    private String spreadsheetId;
    private String spreadsheetTitle;
    private String sheetName;
    private List<String> headers;
    private List<Map<String, String>> rows;
    private int totalRows;
    private List<Map<String, String>> valueTypes;
    private List<Map<String, String>> rawRows;
}
