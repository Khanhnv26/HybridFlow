package com.hybridflow.connector.google.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SpreadsheetMetadataResponse {
    private String spreadsheetId;
    private String title;
    private List<SheetTab> sheets;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SheetTab {
        private int sheetId;
        private String title;
    }
}
