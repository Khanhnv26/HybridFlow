package com.hybridflow.connector.google.dto.request;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReadSheetRequest {
    private String accessToken;
    private String spreadsheetId;
    private String sheetname;
    private java.util.Map<String, String> columnTypes;
}
