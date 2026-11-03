package com.hybridflow.connector.google.service.impl;

import com.google.api.client.http.HttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.client.testing.http.MockHttpTransport;
import com.google.api.client.testing.http.MockLowLevelHttpRequest;
import com.google.api.client.testing.http.MockLowLevelHttpResponse;
import com.google.api.services.sheets.v4.Sheets;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.concurrent.atomic.AtomicReference;
import java.util.Map;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.util.SheetValueTypes;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class GoogleSheetsValueTypeTest {
    private interface Reply { String body(String url, MockLowLevelHttpRequest request) throws java.io.IOException; }

    private GoogleSheetsServiceImpl service(Reply reply) {
        HttpTransport transport = new MockHttpTransport() {
            @Override public MockLowLevelHttpRequest buildRequest(String method, String url) {
                return new MockLowLevelHttpRequest(url) {
                    @Override public MockLowLevelHttpResponse execute() throws java.io.IOException {
                        return new MockLowLevelHttpResponse().setContentType("application/json").setContent(reply.body(url, this));
                    }
                };
            }
        };
        Sheets client = new Sheets.Builder(transport, GsonFactory.getDefaultInstance(), null).setApplicationName("test").build();
        return new GoogleSheetsServiceImpl(mock(GoogleCredentialService.class)) {
            @Override protected Sheets createSheetsClient(String token) { return client; }
        };
    }

    @Test void batchWritesUseJsonNumbersOnlyForExplicitNumericCells() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        GoogleSheetsServiceImpl service = service((url, request) -> { body.set(request.getContentAsString()); return "{}"; });
        Map<String, String> cells = new java.util.LinkedHashMap<>();
        cells.put("Data!C2", "20000.50"); cells.put("Data!A2", "00123"); cells.put("Data!B2", "0901234567");
        service.updateTypedCells("test", "file", cells, Map.of("Data!C2", "NUMBER"));
        JsonNode sent = new ObjectMapper().readTree(body.get());
        assertEquals("RAW", sent.path("valueInputOption").asText());
        assertTrue(sent.path("data").get(0).path("values").get(0).get(0).isNumber());
        assertEquals("00123", sent.path("data").get(1).path("values").get(0).get(0).asText());
        assertEquals("0901234567", sent.path("data").get(2).path("values").get(0).get(0).asText());
    }

    @Test void numericReadsUseUnformattedNumbersButKeepDisplayedIdentifiersAndPhoneNumbers() {
        GoogleSheetsServiceImpl service = service((url, request) -> url.contains("UNFORMATTED_VALUE") ? """
                {"values":[["id","phone","price"],["00123","0901234567",20000]]}
                """ : """
                {"properties":{"title":"Orders"},"sheets":[{"properties":{"title":"Data"}}],
                "values":[["id","phone","price"],["00123","0901234567","20.000"]]}
                """);
        SheetDataResponse data = service.readSheet(ReadSheetRequest.builder().accessToken("test").spreadsheetId("file")
                .sheetname("Data").columnTypes(Map.of("price", "NUMBER")).build());
        assertEquals(Map.of("id", "00123", "phone", "0901234567", "price", "20000"), data.getRows().getFirst());
        assertEquals("NUMBER", data.getValueTypes().getFirst().get("price"));
    }

    @Test void invalidNumericValuesAreRejectedBeforeAnHttpWrite() {
        GoogleSheetsServiceImpl service = service((url, request) -> { fail("Invalid values must never reach Google"); return "{}"; });
        for (String invalid : new String[]{"20,000", "=1+1", "NaN", "Infinity", "12345678901234567", "1e999"}) {
            assertThrows(IllegalArgumentException.class, () -> service.updateCell(UpdateCellRequest.builder().accessToken("test")
                    .spreadsheetId("file").range("Data!C2").value(invalid).valueType("NUMBER").build()));
        }
        assertEquals("", SheetValueTypes.rawValue("", "NUMBER"));
    }
    @Test void configuredPriceIsWrittenAsANumberWhileIdentifiersAndPhoneNumbersStayLiteral() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        HttpTransport transport = new MockHttpTransport() {
            @Override public MockLowLevelHttpRequest buildRequest(String method, String url) {
                assertTrue(url.contains("valueInputOption=RAW"));
                return new MockLowLevelHttpRequest(url) {
                    @Override public MockLowLevelHttpResponse execute() throws java.io.IOException {
                        body.set(getContentAsString());
                        return new MockLowLevelHttpResponse().setContentType("application/json").setContent("{}");
                    }
                };
            }
        };
        Sheets client = new Sheets.Builder(transport, GsonFactory.getDefaultInstance(), null).setApplicationName("test").build();
        GoogleSheetsServiceImpl service = new GoogleSheetsServiceImpl(mock(GoogleCredentialService.class)) {
            @Override protected Sheets createSheetsClient(String token) { return client; }
        };
        service.updateCell(UpdateCellRequest.builder().accessToken("test").spreadsheetId("file").range("Data!C2").value("20000").valueType("NUMBER").build());
        JsonNode number = new ObjectMapper().readTree(body.get()).path("values").get(0).get(0);
        assertTrue(number.isNumber(), "Google must receive a JSON number instead of the string that creates a text cell");
        assertEquals(20000, number.intValue());
        for (String text : new String[]{"00123", "0901234567", "=1+1"}) {
            service.updateCell(UpdateCellRequest.builder().accessToken("test").spreadsheetId("file").range("Data!A2").value(text).valueType("TEXT").build());
            JsonNode value = new ObjectMapper().readTree(body.get()).path("values").get(0).get(0);
            assertTrue(value.isTextual()); assertEquals(text, value.asText());
        }
    }
}
