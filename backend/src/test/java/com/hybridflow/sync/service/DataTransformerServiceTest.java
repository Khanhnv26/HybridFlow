package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.ColumnTransformConfig;
import com.hybridflow.sync.service.impl.DataTransformerServiceImpl;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class DataTransformerServiceTest {
    private final DataTransformerService service = new DataTransformerServiceImpl();
    private String apply(String value, String fallback, String... rules) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("value", value);
        return service.transformRow(row, List.of(new ColumnTransformConfig("value", List.of(rules), fallback))).get("value");
    }
    @Test void trimsUnicodeWhitespaceAndRunsRulesInOrder() {
        assertEquals("SP 01", apply(" \tsp\u00a0 01\n", null, "TRIM", "UPPERCASE"));
        assertEquals("new", apply(null, "NEW", "DEFAULT_IF_EMPTY", "LOWERCASE"));
        assertEquals("NEW", apply(null, "NEW", "LOWERCASE", "DEFAULT_IF_EMPTY"));
    }
    @Test void supportsVietnameseNamesAndEmail() {
        assertEquals("Nguyễn Văn An", apply(" nGUYỄN   VĂN an ", null, "TRIM", "CAPITALIZE"));
        assertEquals("a@example.com", apply(" A@Example.COM ", null, "TRIM", "LOWERCASE"));
    }
    @Test void handlesEmptyNullAndWhitespaceDefaults() {
        for (String value : Arrays.asList(null, "", " \t\u00a0")) assertEquals("N/A", apply(value, "N/A", "DEFAULT_IF_EMPTY"));
        assertEquals("0", apply("0", "N/A", "DEFAULT_IF_EMPTY"));
        assertNull(apply(null, null, "TRIM", "PHONE_VN"));
    }
    @Test void phoneNormalizationIsIdempotentAndPreservesInvalidInput() {
        for (String phone : List.of("0912 345 678", "84 912-345-678", "+84 (912) 345678", "0084912345678")) {
            String clean = apply(phone, null, "PHONE_VN");
            assertEquals("+84912345678", clean);
            assertEquals(clean, apply(clean, null, "PHONE_VN"));
        }
        for (String phone : List.of("abc0912345678", "+12025550123", "123", "")) assertEquals(phone, apply(phone, null, "PHONE_VN"));
    }
    @Test void doesNotMutateSourceRowsAndRejectsInvalidRulesOrColumns() {
        Map<String, String> row = Map.of("value", " a ", "other", "unchanged");
        var clean = service.transformRows(List.of(row), List.of(new ColumnTransformConfig("value", List.of("TRIM"), null)));
        assertEquals(" a ", row.get("value"));
        assertEquals(Map.of("value", "a", "other", "unchanged"), clean.getFirst());
        assertThrows(IllegalArgumentException.class, () -> apply("a", null, "UNKNOWN"));
        assertThrows(IllegalArgumentException.class, () -> service.transformRow(row, List.of(new ColumnTransformConfig("missing", List.of("TRIM"), null))));
    }
}
