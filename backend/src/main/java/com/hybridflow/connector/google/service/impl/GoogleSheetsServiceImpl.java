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
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@lombok.RequiredArgsConstructor
public class GoogleSheetsServiceImpl implements GoogleSheetsService {
    private final GoogleCredentialService credentials;

    protected Sheets createSheetsClient(String accessToken) {
        accessToken = credentials.resolveAccessToken(accessToken);
        if (accessToken == null || accessToken.isBlank() || "ya29.mock".equals(accessToken))
            throw new IllegalArgumentException("Cần access token Google hợp lệ.");
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
            throw new RuntimeException("Lỗi khởi tạo Google Sheets Client: " + e.getMessage(), e);
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
            if (tabs.isEmpty()) throw new IllegalArgumentException("File không có trang tính dạng bảng có thể đồng bộ.");
            return new SpreadsheetMetadataResponse(request.getSpreadsheetId(),
                    metadata.getProperties() == null ? "" : metadata.getProperties().getTitle(), tabs);
        } catch (GoogleJsonResponseException e) {
            if (e.getStatusCode() == 401) throw new GoogleReconnectRequiredException();
            throw new IllegalArgumentException(switch (e.getStatusCode()) {
                case 401 -> "Phiên Google hết hạn. Kết nối lại Google để tải danh sách trang tính.";
                case 403 -> "Tài khoản Google chưa có quyền đọc file này. Kiểm tra quyền chia sẻ hoặc kết nối tài khoản khác.";
                case 404 -> "Không tìm thấy file Google Sheets hoặc tài khoản chưa có quyền truy cập.";
                default -> "Google chưa tải được danh sách trang tính. Vui lòng thử lại.";
            }, e);
        } catch (IOException e) {
            throw new IllegalStateException("Không thể tải danh sách trang tính từ Google. Vui lòng thử lại.", e);
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
                    .spreadsheetTitle(spreadsheet.getProperties() == null ? null : spreadsheet.getProperties().getTitle())
                    .sheetName(targetSheetName)
                    .headers(headers)
                    .rows(rowsList)
                    .totalRows(rowsList.size())
                    .build();

        } catch (GoogleJsonResponseException e) {
            if (e.getStatusCode() == 401) throw new GoogleReconnectRequiredException();
            throw new IllegalArgumentException(switch (e.getStatusCode()) {
                case 401 -> "Phiên Google đã hết hạn. Kết nối Google lại để đọc dữ liệu.";
                case 403 -> "Tài khoản Google chưa có quyền đọc file này. Kiểm tra quyền chia sẻ file.";
                case 404 -> "Không tìm thấy file Google Sheet. Kiểm tra link hoặc quyền truy cập.";
                case 429 -> "Google đang giới hạn lượt đọc. Chờ một lát rồi thử lại.";
                default -> "Google chưa trả được dữ liệu. Vui lòng thử lại sau.";
            }, e);
        } catch (IOException e) {
            throw new IllegalStateException("Không kết nối được Google để đọc dữ liệu. Kiểm tra mạng rồi thử lại.", e);
        }
    }

    @Override
    public UpdateCellResponse updateCell(UpdateCellRequest request) {
        requireText(request.getSpreadsheetId(), "Spreadsheet ID");
        requireText(request.getRange(), "Vị trí ô");
        if (request.getValue() == null) throw new IllegalArgumentException("Giá trị ô không được null. Dùng chuỗi trống để xóa nội dung.");
        Sheets sheets = createSheetsClient(request.getAccessToken());

        try {
            ValueRange body = new ValueRange().setValues(List.of(List.of(request.getValue())));
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
            if (e.getStatusCode() == 401) throw new GoogleReconnectRequiredException();
            throw new IllegalStateException("Không thể cập nhật ô trên Google Sheets.");
        } catch (IOException e) {
            throw new IllegalStateException("Không thể kết nối Google để cập nhật ô.");
        }
    }

    @Override
    public void updateCells(String accessToken, String spreadsheetId, Map<String, String> cells) {
        if (cells.isEmpty()) return;
        List<ValueRange> ranges = cells.entrySet().stream().map(cell -> new ValueRange()
                .setRange(cell.getKey()).setValues(List.of(List.of(cell.getValue() == null ? "" : cell.getValue())))).toList();
        try {
            createSheetsClient(accessToken).spreadsheets().values().batchUpdate(spreadsheetId,
                    new BatchUpdateValuesRequest().setValueInputOption("RAW").setData(ranges)).execute();
        } catch (GoogleJsonResponseException e) {
            if (e.getStatusCode() == 401) throw new GoogleReconnectRequiredException();
            throw new IllegalStateException("Không thể ghi dữ liệu đồng bộ vào Google Sheets.");
        } catch (IOException e) {
            throw new IllegalStateException("Không thể ghi dữ liệu đồng bộ vào Google Sheets.");
        }
    }

    private static void requireText(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + " không được để trống.");
    }
}
