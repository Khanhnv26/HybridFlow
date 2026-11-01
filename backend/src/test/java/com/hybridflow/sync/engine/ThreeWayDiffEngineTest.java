package com.hybridflow.sync.engine;

import com.hybridflow.sync.model.SyncDiffResult;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ThreeWayDiffEngineTest {

    private final ThreeWayDiffEngine engine = new ThreeWayDiffEngine();
    private final Set<String> columns = Set.of("status", "price", "note");

    @Test
    @DisplayName("Case 1: Chỉ bên A sửa giá -> Cập nhật sang B")
    void testOnlyAChanged() {
        Map<String, String> base = Map.of("status", "NEW", "price", "100", "note", "Test");
        Map<String, String> a = Map.of("status", "NEW", "price", "150", "note", "Test");
        Map<String, String> b = Map.of("status", "NEW", "price", "100", "note", "Test");

        SyncDiffResult result = engine.compareRow("ORD-001", base, a, b, columns);

        assertFalse(result.hasConflicts());
        assertEquals("150", result.getUpdatesForB().get("price"));
        assertTrue(result.getUpdatesForA().isEmpty());
    }

    @Test
    @DisplayName("Case 2: Chỉ bên B sửa trạng thái -> Cập nhật sang A")
    void testOnlyBChanged() {
        Map<String, String> base = Map.of("status", "NEW", "price", "100", "note", "Test");
        Map<String, String> a = Map.of("status", "NEW", "price", "100", "note", "Test");
        Map<String, String> b = Map.of("status", "CANCELLED", "price", "100", "note", "Test");

        SyncDiffResult result = engine.compareRow("ORD-001", base, a, b, columns);

        assertFalse(result.hasConflicts());
        assertEquals("CANCELLED", result.getUpdatesForA().get("status"));
        assertTrue(result.getUpdatesForB().isEmpty());
    }

    @Test
    @DisplayName("Case 3: Cả A và B cùng sửa thành giá trị giống nhau -> Hội tụ, không xung đột")
    void testBothChangedSameValue() {
        Map<String, String> base = Map.of("status", "NEW", "price", "100", "note", "Test");
        Map<String, String> a = Map.of("status", "DONE", "price", "100", "note", "Test");
        Map<String, String> b = Map.of("status", "DONE", "price", "100", "note", "Test");

        SyncDiffResult result = engine.compareRow("ORD-001", base, a, b, columns);

        assertFalse(result.hasConflicts());
        assertTrue(result.getUpdatesForA().isEmpty());
        assertTrue(result.getUpdatesForB().isEmpty());
    }

    @Test
    @DisplayName("Case 4: Cả A và B cùng sửa một cột nhưng giá trị KHÁC NHAU -> Báo CONFLICT")
    void testConflictDifferentValues() {
        Map<String, String> base = Map.of("status", "NEW", "price", "100", "note", "Test");
        Map<String, String> a = Map.of("status", "SHIPPING", "price", "100", "note", "Test");
        Map<String, String> b = Map.of("status", "CANCELLED", "price", "100", "note", "Test");

        SyncDiffResult result = engine.compareRow("ORD-001", base, a, b, columns);

        assertTrue(result.hasConflicts());
        assertEquals(1, result.getConflicts().size());
        assertEquals("status", result.getConflicts().get(0).getColumn());
        assertEquals("NEW", result.getConflicts().get(0).getBaseValue());
        assertEquals("SHIPPING", result.getConflicts().get(0).getValueA());
        assertEquals("CANCELLED", result.getConflicts().get(0).getValueB());
    }

    @Test
    @DisplayName("Case 5: A sửa giá, B sửa trạng thái (2 cột khác nhau) -> Merge độc lập cả 2 bên")
    void testIndependentFieldChanges() {
        Map<String, String> base = Map.of("status", "NEW", "price", "100", "note", "Test");
        Map<String, String> a = Map.of("status", "NEW", "price", "200", "note", "Test");    // A sửa price
        Map<String, String> b = Map.of("status", "DONE", "price", "100", "note", "Test");   // B sửa status

        SyncDiffResult result = engine.compareRow("ORD-001", base, a, b, columns);

        assertFalse(result.hasConflicts());
        assertEquals("200", result.getUpdatesForB().get("price"));  // Giá của A đẩy sang B
        assertEquals("DONE", result.getUpdatesForA().get("status")); // Trạng thái của B đẩy sang A
    }
}
