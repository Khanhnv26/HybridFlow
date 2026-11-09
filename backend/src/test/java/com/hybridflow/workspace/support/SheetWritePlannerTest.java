package com.hybridflow.workspace.support;

import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.workspace.dto.request.SheetWritePreviewRequest;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SheetWritePlannerTest {

    private SheetWritePlanner planner;

    @BeforeEach
    void setUp() {
        planner = new SheetWritePlanner();
    }

    @Test
    void plan_validChanges_succeeds() {
        List<String> sourceHeaders = List.of("id", "name", "status");
        List<Map<String, String>> sourceRows = List.of(
                Map.of("id", "101", "name", "Alice", "status", "Active"),
                Map.of("id", "102", "name", "Bob", "status", "Inactive"),
                Map.of("id", "103", "name", "Charlie", "status", "Active")
        );

        SheetDataResponse targetSheet = SheetDataResponse.builder()
                .headers(List.of("target_id", "target_name", "target_status"))
                .rows(List.of(
                        Map.of("target_id", "101", "target_name", "Alice", "target_status", "Pending"),
                        Map.of("target_id", "102", "target_name", "Robert", "target_status", "Inactive"),
                        Map.of("target_id", "103", "target_name", "Charlie", "target_status", "Active")
                ))
                .build();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = List.of(
                new SheetWritePreviewRequest.ColumnMappingItem("name", "target_name"),
                new SheetWritePreviewRequest.ColumnMappingItem("status", "target_status")
        );

        SheetWritePreviewResponse response = planner.plan(
                sourceRows,
                sourceHeaders,
                targetSheet,
                "id",
                "target_id",
                mappings
        );

        assertTrue(response.isValid());
        assertTrue(response.getErrors().isEmpty());
        assertEquals(2, response.getChanges().size());

        SheetWritePreviewResponse.CellChangePreview change1 = response.getChanges().get(0);
        assertEquals("101", change1.getKey());
        assertEquals(2, change1.getTargetRowNumber());
        assertEquals(0, change1.getTargetRowIndex());
        assertEquals("status", change1.getSourceColumn());
        assertEquals("target_status", change1.getTargetColumn());
        assertEquals("Pending", change1.getCurrentValue());
        assertEquals("Active", change1.getNewValue());

        SheetWritePreviewResponse.CellChangePreview change2 = response.getChanges().get(1);
        assertEquals("102", change2.getKey());
        assertEquals(3, change2.getTargetRowNumber());
        assertEquals(1, change2.getTargetRowIndex());
        assertEquals("name", change2.getSourceColumn());
        assertEquals("target_name", change2.getTargetColumn());
        assertEquals("Robert", change2.getCurrentValue());
        assertEquals("Bob", change2.getNewValue());

        assertTrue(response.getMissingSourceKeyRows().isEmpty());
        assertTrue(response.getUnmatchedRows().isEmpty());
        assertTrue(response.getDuplicateTargetKeys().isEmpty());
    }

    @Test
    void plan_missingSourceKeysAndUnmatchedRows_trackedProperly() {
        List<String> sourceHeaders = List.of("id", "email");
        List<Map<String, String>> sourceRows = List.of(
                Map.of("id", "", "email", "empty_key@test.com"),
                Map.of("id", "201", "email", "matched@test.com"),
                Map.of("id", "999", "email", "unmatched@test.com")
        );

        SheetDataResponse targetSheet = SheetDataResponse.builder()
                .headers(List.of("id", "email"))
                .rows(List.of(
                        Map.of("id", "201", "email", "old@test.com")
                ))
                .build();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = List.of(
                new SheetWritePreviewRequest.ColumnMappingItem("email", "email")
        );

        SheetWritePreviewResponse response = planner.plan(
                sourceRows,
                sourceHeaders,
                targetSheet,
                "id",
                "id",
                mappings
        );

        assertTrue(response.isValid());
        assertEquals(List.of(2), response.getMissingSourceKeyRows());
        assertEquals(1, response.getUnmatchedRows().size());
        assertEquals("999", response.getUnmatchedRows().get(0).getKey());
        assertEquals(4, response.getUnmatchedRows().get(0).getSourceRowNumber());
        assertEquals(1, response.getChanges().size());
    }

    @Test
    void plan_missingHeaders_returnsErrors() {
        List<String> sourceHeaders = List.of("other_id", "email");
        SheetDataResponse targetSheet = SheetDataResponse.builder()
                .headers(List.of("other_target_id", "email"))
                .rows(List.of())
                .build();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = List.of(
                new SheetWritePreviewRequest.ColumnMappingItem("email", "email")
        );

        SheetWritePreviewResponse response = planner.plan(
                List.of(),
                sourceHeaders,
                targetSheet,
                "missing_source_key",
                "missing_target_key",
                mappings
        );

        assertFalse(response.isValid());
        assertTrue(response.getErrors().stream().anyMatch(e -> e.contains("missing_source_key")));
        assertTrue(response.getErrors().stream().anyMatch(e -> e.contains("missing_target_key")));
    }

    @Test
    void plan_invalidMappings_returnsErrors() {
        List<String> sourceHeaders = List.of("id", "name");
        SheetDataResponse targetSheet = SheetDataResponse.builder()
                .headers(List.of("id", "name", "role"))
                .rows(List.of())
                .build();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = List.of(
                new SheetWritePreviewRequest.ColumnMappingItem("not_in_source", "name"),
                new SheetWritePreviewRequest.ColumnMappingItem("name", "not_in_target"),
                new SheetWritePreviewRequest.ColumnMappingItem("name", "id") // overwrite target key
        );

        SheetWritePreviewResponse response = planner.plan(
                List.of(),
                sourceHeaders,
                targetSheet,
                "id",
                "id",
                mappings
        );

        assertFalse(response.isValid());
        assertTrue(response.getErrors().stream().anyMatch(e -> e.contains("not_in_source")));
        assertTrue(response.getErrors().stream().anyMatch(e -> e.contains("not_in_target")));
        assertTrue(response.getErrors().stream().anyMatch(e -> e.contains("Không được ánh xạ ghi đè vào cột khóa đích")));
    }

    @Test
    void plan_duplicateTargetKeys_returnsErrorsWithRowNumbers() {
        List<String> sourceHeaders = List.of("id", "name");
        SheetDataResponse targetSheet = SheetDataResponse.builder()
                .headers(List.of("id", "name"))
                .rows(List.of(
                        Map.of("id", "DUP1", "name", "First"),
                        Map.of("id", "UNIQUE", "name", "Second"),
                        Map.of("id", "DUP1", "name", "Third")
                ))
                .build();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = List.of(
                new SheetWritePreviewRequest.ColumnMappingItem("name", "name")
        );

        SheetWritePreviewResponse response = planner.plan(
                List.of(Map.of("id", "DUP1", "name", "New")),
                sourceHeaders,
                targetSheet,
                "id",
                "id",
                mappings
        );

        assertFalse(response.isValid());
        assertEquals(1, response.getDuplicateTargetKeys().size());
        assertEquals("DUP1", response.getDuplicateTargetKeys().get(0).getKey());
        assertEquals(List.of(2, 4), response.getDuplicateTargetKeys().get(0).getTargetRowNumbers());
        assertTrue(response.getErrors().stream().anyMatch(e -> e.contains("trùng lặp")));
    }

    @Test
    void plan_rejectsDuplicateSourceKeysWithOriginalSheetRowNumbers() {
        SheetDataResponse target = SheetDataResponse.builder()
                .headers(List.of("id", "name"))
                .rows(List.of(Map.of("id", "1", "name", "Current")))
                .build();

        SheetWritePreviewResponse response = planner.plan(
                List.of(Map.of("id", "1", "name", "First"), Map.of("id", " 1 ", "name", "Second")),
                List.of("id", "name"), target, "id", "id",
                List.of(new SheetWritePreviewRequest.ColumnMappingItem("name", "name")), Map.of(0, 3, 1, 8));

        assertFalse(response.isValid());
        assertTrue(response.getChanges().isEmpty());
        assertEquals(List.of("Khóa nguồn '1' bị trùng ở dòng 3 và 8."), response.getErrors());
    }

    @Test
    void planAppend_createsNewRowAtEndOfTargetSheet() {
        List<String> webhookHeaders = List.of("ma_hv", "ho_ten", "hoc_phi");
        List<Map<String, String>> webhookRows = List.of(
                Map.of("ma_hv", "HV-2404", "ho_ten", "Nguyễn Minh Anh", "hoc_phi", "6.500.000đ")
        );

        SheetDataResponse targetSheet = SheetDataResponse.builder()
                .headers(List.of("Mã HV", "Họ Tên", "Học Phí", "Công thức"))
                .rows(List.of(
                        Map.of("Mã HV", "HV-2401", "Họ Tên", "Nguyễn Hoàng Nam", "Học Phí", "6.500.000đ", "Công thức", "=B2")
                ))
                .build();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = List.of(
                new SheetWritePreviewRequest.ColumnMappingItem("ho_ten", "Họ Tên"),
                new SheetWritePreviewRequest.ColumnMappingItem("hoc_phi", "Học Phí")
        );

        SheetWritePreviewResponse response = planner.planAppend(
                webhookRows,
                webhookHeaders,
                targetSheet,
                "ma_hv",
                "Mã HV",
                mappings
        );

        assertTrue(response.isValid());
        assertTrue(response.getErrors().isEmpty());
        // 3 changes: 1 for key (Mã HV) and 2 for mappings (Họ Tên, Học Phí)
        assertEquals(3, response.getChanges().size());

        SheetWritePreviewResponse.CellChangePreview keyChange = response.getChanges().get(0);
        assertEquals("HV-2404", keyChange.getKey());
        assertEquals(3, keyChange.getTargetRowNumber());
        assertEquals(1, keyChange.getTargetRowIndex());
        assertEquals("Mã HV", keyChange.getTargetColumn());
        assertEquals("", keyChange.getCurrentValue());
        assertEquals("HV-2404", keyChange.getNewValue());

        SheetWritePreviewResponse.CellChangePreview nameChange = response.getChanges().get(1);
        assertEquals("HV-2404", nameChange.getKey());
        assertEquals(3, nameChange.getTargetRowNumber());
        assertEquals(1, nameChange.getTargetRowIndex());
        assertEquals("Họ Tên", nameChange.getTargetColumn());
        assertEquals("", nameChange.getCurrentValue());
        assertEquals("Nguyễn Minh Anh", nameChange.getNewValue());
    }

    @Test
    void planAppend_rejectsExistingTargetKey() {
        List<String> webhookHeaders = List.of("ma_hv", "ho_ten");
        List<Map<String, String>> webhookRows = List.of(
                Map.of("ma_hv", "HV-2401", "ho_ten", "Nguyễn Hoàng Nam")
        );

        SheetDataResponse targetSheet = SheetDataResponse.builder()
                .headers(List.of("Mã HV", "Họ Tên"))
                .rows(List.of(
                        Map.of("Mã HV", "HV-2401", "Họ Tên", "Nguyễn Hoàng Nam")
                ))
                .build();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = List.of(
                new SheetWritePreviewRequest.ColumnMappingItem("ho_ten", "Họ Tên")
        );

        SheetWritePreviewResponse response = planner.planAppend(
                webhookRows,
                webhookHeaders,
                targetSheet,
                "ma_hv",
                "Mã HV",
                mappings
        );

        assertFalse(response.isValid());
        assertTrue(response.getChanges().isEmpty());
        assertTrue(response.getErrors().stream().anyMatch(e -> e.contains("đã tồn tại ở dòng 2")));
    }
}
