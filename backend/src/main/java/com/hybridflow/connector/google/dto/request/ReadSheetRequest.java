package com.hybridflow.connector.google.dto.request;

import lombok.*;

import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReadSheetRequest {
    private String accessToken;
    private String spreadsheetId;
    private String sheetname;
    private Map<String, String> columnTypes;

    public String getSheetname() {
        return sheetname;
    }

    public void setSheetname(String sheetname) {
        this.sheetname = sheetname;
    }

    public String getSheetName() {
        return sheetname;
    }

    public void setSheetName(String sheetName) {
        this.sheetname = sheetName;
    }

    public static class ReadSheetRequestBuilder {
        public ReadSheetRequestBuilder sheetName(String sheetName) {
            this.sheetname = sheetName;
            return this;
        }

        public ReadSheetRequestBuilder sheetname(String sheetname) {
            this.sheetname = sheetname;
            return this;
        }
    }
}
