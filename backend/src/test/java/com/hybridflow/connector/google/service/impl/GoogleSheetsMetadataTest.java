package com.hybridflow.connector.google.service.impl;

import com.google.api.client.http.HttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.client.testing.http.MockHttpTransport;
import com.google.api.client.testing.http.MockLowLevelHttpRequest;
import com.google.api.client.testing.http.MockLowLevelHttpResponse;
import com.google.api.services.sheets.v4.Sheets;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoogleSheetsMetadataTest {
    private GoogleSheetsServiceImpl service(int statusCode, String body) {
        HttpTransport transport = new MockHttpTransport() {
            @Override public MockLowLevelHttpRequest buildRequest(String method, String url) {
                return new MockLowLevelHttpRequest(url).setResponse(new MockLowLevelHttpResponse().setStatusCode(statusCode)
                        .setContentType("application/json; charset=UTF-8").setContent(body));
            }
        };
        Sheets client = new Sheets.Builder(transport, GsonFactory.getDefaultInstance(), null)
                .setApplicationName("HybridFlow test").build();
        return new GoogleSheetsServiceImpl(Mockito.mock(GoogleCredentialService.class)) {
            @Override protected Sheets createSheetsClient(String accessToken) { return client; }
        };
    }
    private ReadSheetRequest request() {
        return ReadSheetRequest.builder().accessToken("test-token").spreadsheetId("file").build();
    }
    @Test void listsActualTabsAndTheirIdsWithoutReadingRows() {
        SpreadsheetMetadataResponse response = service(200, """
                {"spreadsheetId":"file","properties":{"title":"Inventory"},"sheets":[
                {"properties":{"sheetId":0,"title":"Orders","sheetType":"GRID"}},
                {"properties":{"sheetId":42,"title":"Products","sheetType":"GRID"}},
                {"properties":{"sheetId":99,"title":"Chart","sheetType":"OBJECT"}}]}
                """).getMetadata(request());
        assertEquals("Inventory", response.getTitle());
        assertEquals("file", response.getSpreadsheetId());
        assertEquals(2, response.getSheets().size());
        assertEquals(0, response.getSheets().get(0).getSheetId());
        assertEquals("Products", response.getSheets().get(1).getTitle());
    }
    @Test void inaccessibleFileReturnsAnActionableErrorInsteadOfFakeTabs() {
        ApplicationException error = assertThrows(ApplicationException.class, () ->
                service(403, "{\"error\":{\"code\":403,\"message\":\"Forbidden\"}}").getMetadata(request()));
        assertTrue(error.getMessage().contains("quyền truy cập"));
    }
    @Test void emptySpreadsheetDoesNotProduceASampleTab() {
        assertThrows(IllegalArgumentException.class, () -> service(200, "{\"sheets\":[]}").getMetadata(request()));
    }
    @Test void dataReadIncludesActualFileTitleAndTabName() {
        SheetDataResponse data = service(200, """
                {"properties":{"title":"Kho Hà Nội"},"sheets":[{"properties":{"title":"Tồn kho"}}],
                "values":[["id","quantity"],["SP01",12]]}
                """).readSheet(request());
        assertEquals("Kho Hà Nội", data.getSpreadsheetTitle());
        assertEquals("Tồn kho", data.getSheetName());
        assertEquals(1, data.getTotalRows());
    }
    @Test void emptyDataStillIdentifiesItsFileAndTab() {
        SheetDataResponse data = service(200, """
                {"properties":{"title":"Empty workbook"},"sheets":[{"properties":{"title":"Data"}}]}
                """).readSheet(request());
        assertEquals("Empty workbook", data.getSpreadsheetTitle());
        assertEquals(0, data.getTotalRows());
    }
    @Test void failedDataReadExplainsPermissionsWithoutDumpingProviderDetails() {
        ApplicationException error = assertThrows(ApplicationException.class, () ->
                service(403, "{\"error\":{\"code\":403,\"message\":\"Forbidden\"}}").readSheet(request()));
        assertTrue(error.getMessage().contains("quyền truy cập"));
    }
}
