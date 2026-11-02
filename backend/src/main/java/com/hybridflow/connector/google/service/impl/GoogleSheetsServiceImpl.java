package com.hybridflow.connector.google.service.impl;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.Sheet;
import com.google.api.services.sheets.v4.model.Spreadsheet;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class GoogleSheetsServiceImpl implements GoogleSheetsService {

    private Sheets createSheetsClient(String accessToken) {
        try {
            GoogleCredentials credentials = GoogleCredentials.create(new AccessToken(accessToken, null));
            return new Sheets.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(),
                    GsonFactory.getDefaultInstance(),
                    new HttpCredentialsAdapter(credentials))
                    .setApplicationName("HybridFlow")
                    .build();
        } catch (GeneralSecurityException | IOException e) {
            throw new RuntimeException("Lỗi khởi tạo Google Sheets Client: " + e.getMessage(), e);
        }
    }

    @Override
    public SheetDataResponse readSheet(ReadSheetRequest request) {
        Sheets sheets = createSheetsClient(request.getAccessToken());

        try {
            //Lấy metadata của spreadsheet để kiểm tra các tab sheet hiện có
            Spreadsheet spreadsheet = sheets.spreadsheets()
                    .get(request.getSpreadsheetId())
                    .execute();

            List<String> availableSheetNames = spreadsheet.getSheets().stream()
                    .map(s -> s.getProperties().getTitle())
                    .toList();

            if (availableSheetNames.isEmpty()) {
                throw new RuntimeException("Spreadsheet không có sheet nào!");
            }

            //Xác định sheetName cần đọc:
            String targetSheetName;
            if (request.getSheetname() == null || request.getSheetname().isBlank()) {
                // Nếu client không truyền sheetName, tự động lấy sheet đầu tiên
                targetSheetName = availableSheetNames.get(0);
            } else {
                String inputName = request.getSheetname().trim();
                // Tìm kiếm: khớp chính xác -> hoặc khớp không phân biệt hoa thường / khoảng trắng thừa
                targetSheetName = availableSheetNames.stream()
                        .filter(name -> name.trim().equalsIgnoreCase(inputName))
                        .findFirst()
                        .orElse(null);

                if (targetSheetName == null) {
                    throw new IllegalArgumentException(
                            "Không tìm thấy tab '" + inputName + "'. Các tab hiện có trong Google Sheet: " + availableSheetNames
                    );
                }
            }

            String safeSheetName = targetSheetName.replace("'", "''");
            String range = "'" + safeSheetName + "'!A1:Z";

            ValueRange response = sheets.spreadsheets().values()
                    .get(request.getSpreadsheetId(), range)
                    .execute();

            List<List<Object>> values = response.getValues();
            if (values == null || values.isEmpty()) {
                return SheetDataResponse.builder()
                        .spreadsheetId(request.getSpreadsheetId())
                        .sheetName(targetSheetName)
                        .headers(List.of())
                        .rows(List.of())
                        .totalRows(0)
                        .build();
            }

            List<String> headers = values.get(0).stream()
                    .map(Object::toString)
                    .toList();

            List<Map<String, String>> rowsList = new ArrayList<>();

            for (int i = 1; i < values.size(); i++) {
                List<Object> row = values.get(i);
                Map<String, String> rowMap = new LinkedHashMap<>();

                for (int col = 0; col < headers.size(); col++) {
                    String colName = headers.get(col);
                    String cellValue = col < row.size() ? row.get(col).toString() : "";
                    rowMap.put(colName, cellValue);
                }
                rowsList.add(rowMap);
            }

            return SheetDataResponse.builder()
                    .spreadsheetId(request.getSpreadsheetId())
                    .sheetName(targetSheetName)
                    .headers(headers)
                    .rows(rowsList)
                    .totalRows(rowsList.size())
                    .build();

        } catch (IOException e) {
            throw new RuntimeException("Lỗi đọc dữ liệu từ Google Sheets: " + e.getMessage(), e);
        }
    }

    @Override
    public UpdateCellResponse updateCell(UpdateCellRequest request) {
        Sheets sheets = createSheetsClient(request.getAccessToken());

        try {
            ValueRange body = new ValueRange().setValues(List.of(List.of(request.getValue())));
            sheets.spreadsheets().values()
                    .update(request.getSpreadsheetId(), request.getRange(), body)
                    .setValueInputOption("USER_ENTERED")
                    .execute();

            return UpdateCellResponse.builder()
                    .range(request.getRange())
                    .updatedValue(request.getValue())
                    .success(true)
                    .message("Cập nhật ô thành công")
                    .build();

        } catch (IOException e) {
            throw new RuntimeException("Lỗi cập nhật ô trong Google Sheets: " + e.getMessage(), e);
        }
    }
}
