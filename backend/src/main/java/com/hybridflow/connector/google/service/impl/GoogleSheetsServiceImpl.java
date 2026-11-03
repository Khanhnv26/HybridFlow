package com.hybridflow.connector.google.service.impl;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.BatchUpdateValuesRequest;
import com.google.api.services.sheets.v4.model.Sheet;
import com.google.api.services.sheets.v4.model.Spreadsheet;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.common.util.ExternalErrors;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.connector.google.util.SheetValueTypes;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class GoogleSheetsServiceImpl implements GoogleSheetsService {
    private final GoogleCredentialService credentials;

    protected Sheets createSheetsClient(String accessToken) {
        accessToken = credentials.resolveAccessToken(accessToken);
        if (accessToken == null || accessToken.isBlank() || "ya29.mock".equals(accessToken))
            throw new ValidationException("Cần access token Google hợp lệ.");
        try {
            GoogleCredentials credentials = GoogleCredentials.create(new AccessToken(accessToken, null));
            return new Sheets.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(),
                    GsonFactory.getDefaultInstance(),
                    httpRequest -> {
                        new HttpCredentialsAdapter(credentials).initialize(httpRequest);
                        httpRequest.setConnectTimeout(10000);
                        httpRequest.setReadTimeout(30000);
                    })
                    .setApplicationName("HybridFlow")
                    .build();
        } catch (GeneralSecurityException | IOException e) {
            throw new ApplicationException(ErrorCode.CONFIGURATION_ERROR, "Không thể khởi tạo kết nối Google Sheets.", e);
        }
    }

    @Override
    public SpreadsheetMetadataResponse getMetadata(ReadSheetRequest request) {
        requireText(request.getSpreadsheetId(), "Spreadsheet ID");
        try {
            Spreadsheet metadata = createSheetsClient(request.getAccessToken()).spreadsheets()
                    .get(request.getSpreadsheetId())
                    .setFields("spreadsheetId,properties(title),sheets(properties(sheetId,title,sheetType))")
                    .execute();
            List<SpreadsheetMetadataResponse.SheetTab> tabs = (metadata.getSheets() == null ? List.<Sheet>of() : metadata.getSheets()).stream()
                    .map(Sheet::getProperties)
                    .filter(p -> p != null && p.getSheetId() != null && p.getTitle() != null
                            && (p.getSheetType() == null || "GRID".equals(p.getSheetType())))
                    .map(p -> new SpreadsheetMetadataResponse.SheetTab(p.getSheetId(), p.getTitle()))
                    .toList();
            if (tabs.isEmpty()) throw new ValidationException("File không có trang tính dạng bảng có thể đồng bộ.");
            return new SpreadsheetMetadataResponse(request.getSpreadsheetId(),
                    metadata.getProperties() == null ? "" : metadata.getProperties().getTitle(), tabs);
        } catch (GoogleJsonResponseException e) {
            throw googleFailure(e);
        } catch (IOException e) {
            throw new ApplicationException(e instanceof SocketTimeoutException ? ErrorCode.UPSTREAM_TIMEOUT : ErrorCode.UPSTREAM_UNAVAILABLE, "Chưa kết nối được Google Sheets. Vui lòng thử lại sau.", e);
        }
    }

    @Override
    public SheetDataResponse readSheet(ReadSheetRequest request) {
        requireText(request.getSpreadsheetId(), "Spreadsheet ID");
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
                throw new ValidationException("File không có trang tính nào để đọc.");
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
                    throw new ValidationException(
                            "Không tìm thấy tab '" + inputName + "'. Các tab hiện có trong Google Sheet: " + availableSheetNames
                    );
                }
            }

            String safeSheetName = targetSheetName.replace("'", "''");
            String range = "'" + safeSheetName + "'";

            ValueRange response = sheets.spreadsheets().values()
                    .get(request.getSpreadsheetId(), range)
                    .execute();

            List<List<Object>> values = response.getValues();
            if (values == null || values.isEmpty()) {
                return SheetDataResponse.builder()
                        .spreadsheetId(request.getSpreadsheetId())
                        .spreadsheetTitle(spreadsheet.getProperties() == null ? null : spreadsheet.getProperties().getTitle())
                    .sheetName(targetSheetName)
                        .headers(List.of())
                        .rows(List.of())
                        .totalRows(0)
                        .build();
            }

            List<String> headers = values.get(0).stream()
                    .map(Object::toString)
                    .toList();

            boolean typed = request.getColumnTypes() != null && !request.getColumnTypes().isEmpty();
            List<List<Object>> rawValues = typed ? sheets.spreadsheets().values().get(request.getSpreadsheetId(), range)
                    .setValueRenderOption("UNFORMATTED_VALUE").execute().getValues() : values;
            List<Map<String, String>> rowsList = new ArrayList<>();
            List<Map<String, String>> valueTypes = new ArrayList<>();
            List<Map<String, String>> rawRows = new ArrayList<>();

            for (int i = 1; i < values.size(); i++) {
                List<Object> row = values.get(i);
                Map<String, String> rowMap = new LinkedHashMap<>();
                Map<String, String> rowTypes = new LinkedHashMap<>();
                Map<String, String> rawRow = new LinkedHashMap<>();

                for (int col = 0; col < headers.size(); col++) {
                    String colName = headers.get(col);
                    String cellValue = col < row.size() ? row.get(col).toString() : "";
                    Object raw = rawValues != null && i < rawValues.size() && col < rawValues.get(i).size() ? rawValues.get(i).get(col) : "";
                    rowTypes.put(colName, raw instanceof Number ? "NUMBER" : "TEXT");
                    rawRow.put(colName, raw == null ? "" : raw.toString());
                    if (typed && "NUMBER".equals(request.getColumnTypes().get(colName)))
                        cellValue = SheetValueTypes.canonical(raw == null ? "" : raw.toString(), "NUMBER");
                    rowMap.put(colName, cellValue);
                }
                rowsList.add(rowMap);
                valueTypes.add(rowTypes);
                rawRows.add(rawRow);
            }

            return SheetDataResponse.builder()
                    .spreadsheetId(request.getSpreadsheetId())
                    .spreadsheetTitle(spreadsheet.getProperties() == null ? null : spreadsheet.getProperties().getTitle())
                    .sheetName(targetSheetName)
                    .headers(headers)
                    .rows(rowsList).valueTypes(valueTypes).rawRows(rawRows)
                    .totalRows(rowsList.size())
                    .build();

        } catch (GoogleJsonResponseException e) {
            throw googleFailure(e);
        } catch (IOException e) {
            throw new ApplicationException(e instanceof SocketTimeoutException ? ErrorCode.UPSTREAM_TIMEOUT : ErrorCode.UPSTREAM_UNAVAILABLE, "Chưa kết nối được Google Sheets. Vui lòng thử lại sau.", e);
        }
    }

    @Override
    public UpdateCellResponse updateCell(UpdateCellRequest request) {
        requireText(request.getSpreadsheetId(), "Spreadsheet ID");
        requireText(request.getRange(), "Vị trí ô");
        if (request.getValue() == null) throw new ValidationException("Giá trị ô không được null. Dùng chuỗi trống để xóa nội dung.");
        Sheets sheets = createSheetsClient(request.getAccessToken());

        try {
            ValueRange body = new ValueRange().setValues(List.of(List.of(SheetValueTypes.rawValue(request.getValue(), request.getValueType()))));
            sheets.spreadsheets().values()
                    .update(request.getSpreadsheetId(), request.getRange(), body)
                    .setValueInputOption("RAW")
                    .execute();

            return UpdateCellResponse.builder()
                    .range(request.getRange())
                    .updatedValue(request.getValue())
                    .success(true)
                    .message("Cập nhật ô thành công")
                    .build();

        } catch (GoogleJsonResponseException e) {
            throw googleFailure(e);
        } catch (IOException e) {
            throw new ApplicationException(e instanceof SocketTimeoutException ? ErrorCode.UPSTREAM_TIMEOUT : ErrorCode.UPSTREAM_UNAVAILABLE, "Chưa kết nối được Google Sheets. Vui lòng thử lại sau.", e);
        }
    }

    @Override
    public void updateCells(String accessToken, String spreadsheetId, Map<String, String> cells) {
        updateTypedCells(accessToken, spreadsheetId, cells, Map.of());
    }

    @Override
    public void updateTypedCells(String accessToken, String spreadsheetId, Map<String, String> cells, Map<String, String> valueTypes) {
        if (cells.isEmpty()) return;
        List<ValueRange> ranges = cells.entrySet().stream().map(cell -> new ValueRange()
                .setRange(cell.getKey()).setValues(List.of(List.of(SheetValueTypes.rawValue(cell.getValue(), valueTypes.get(cell.getKey())))))).toList();
        try {
            createSheetsClient(accessToken).spreadsheets().values().batchUpdate(spreadsheetId,
                    new BatchUpdateValuesRequest().setValueInputOption("RAW").setData(ranges)).execute();
        } catch (GoogleJsonResponseException e) {
            throw googleFailure(e);
        } catch (IOException e) {
            throw new ApplicationException(e instanceof SocketTimeoutException ? ErrorCode.UPSTREAM_TIMEOUT : ErrorCode.UPSTREAM_UNAVAILABLE, "Chưa kết nối được Google Sheets. Vui lòng thử lại sau.", e);
        }
    }

    private ApplicationException googleFailure(GoogleJsonResponseException exception) {
        int status = exception.getStatusCode();
        if (status == 403 && exception.getDetails() != null && exception.getDetails().getErrors() != null
                && exception.getDetails().getErrors().stream().anyMatch(error -> error != null && error.getReason() != null && List.of("rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded").contains(error.getReason()))) status = 429;
        int retryAfter = 0;
        try {
            if (exception.getHeaders() != null && exception.getHeaders().getRetryAfter() != null)
                retryAfter = Math.min(86400, Math.max(0, Integer.parseInt(exception.getHeaders().getRetryAfter())));
        } catch (NumberFormatException ignored) { /* Retry with local backoff if the provider uses an HTTP date. */ }
        return ExternalErrors.google(status, retryAfter);
    }

    private static void requireText(String value, String label) {
        if (value == null || value.isBlank()) throw new ValidationException(label + " không được để trống.");
    }
}
