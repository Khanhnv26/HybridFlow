package com.hybridflow.sync.util;


import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class SheetRowUtilsTest {
    @Test void blankRowsRetainPhysicalPositionsAndQuotesAreEscaped() {
        SheetDataResponse sheet = SheetDataResponse.builder().sheetName("O'Brien").headers(List.of("status", "id"))
                .rows(List.of(Map.of("id", "", "status", ""), Map.of("id", "x", "status", "NEW"))).build();
        assertEquals(1, SheetRowUtils.index(sheet, "id").get("x"));
        assertEquals("'O''Brien'!A3", SheetRowUtils.range(sheet, 1, "status"));
    }
    @Test void columnsBeyondZAreSupported() {
        List<String> headers = new ArrayList<String>(); for (int i = 0; i < 28; i++) headers.add("c" + i);
        SheetDataResponse sheet = SheetDataResponse.builder().sheetName("Data").headers(headers).build();
        assertEquals("'Data'!AB2", SheetRowUtils.range(sheet, 0, "c27"));
    }
    @Test void nonEmptyRowsWithoutAnIdAreRejected() {
        SheetDataResponse sheet = SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "status"))
                .rows(List.of(Map.of("id", "", "status", "NEW"))).build();
        assertThrows(IllegalArgumentException.class, () -> SheetRowUtils.index(sheet, "id"));
    }
}
