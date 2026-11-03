package com.hybridflow.connector.google.service;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;

import java.util.Map;

public interface GoogleSheetsService {

    SheetDataResponse readSheet(ReadSheetRequest request);
    SpreadsheetMetadataResponse getMetadata(ReadSheetRequest request);
    UpdateCellResponse updateCell(UpdateCellRequest request);
    void updateCells(String accessToken, String spreadsheetId, Map<String, String> cells);
    void updateTypedCells(String accessToken, String spreadsheetId, Map<String, String> cells, Map<String, String> valueTypes);
}
