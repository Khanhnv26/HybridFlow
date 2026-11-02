package com.hybridflow.connector.google.service.impl;

import com.google.api.client.http.HttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.client.testing.http.MockHttpTransport;
import com.google.api.client.testing.http.MockLowLevelHttpResponse;
import com.google.api.services.sheets.v4.Sheets;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GoogleSheetsMetadataTest {
    private GoogleSheetsServiceImpl service(int statusCode, String body) {
        MockLowLevelHttpResponse response = new MockLowLevelHttpResponse().setStatusCode(statusCode)
                .setContentType("application/json; charset=UTF-8").setContent(body);
        HttpTransport transport = new MockHttpTransport.Builder().setLowLevelHttpResponse(response).build();
        Sheets client = new Sheets.Builder(transport, GsonFactory.getDefaultInstance(), null)
                .setApplicationName("HybridFlow test").build();
        return new GoogleSheetsServiceImpl() {
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
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                service(403, "{\"error\":{\"code\":403,\"message\":\"Forbidden\"}}").getMetadata(request()));
        assertTrue(error.getMessage().contains("quyền đọc"));
    }
    @Test void emptySpreadsheetDoesNotProduceASampleTab() {
        assertThrows(IllegalArgumentException.class, () -> service(200, "{\"sheets\":[]}").getMetadata(request()));
    }
}
