package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.service.impl.NotificationTemplateServiceImpl;
import com.hybridflow.sync.service.impl.RuleEvaluationServiceImpl;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class RuleEvaluationServiceTest {

    private final RuleEvaluationService ruleService = new RuleEvaluationServiceImpl();
    private final NotificationTemplateService templateService = new NotificationTemplateServiceImpl();

    @Test
    void validationFailsOnMissingOrInvalidColumnsAndOperators() {
        Set<String> columns = Set.of("sku", "status", "price");

        // Missing column
        RouterPlan plan1 = RouterPlan.builder()
                .nodeId("r1")
                .triggerOn("CHANGED")
                .matchMode("ALL")
                .conditions(List.of(RouterConditionItem.builder().columnName("unknown").operator("EQUALS").value("1").build()))
                .build();
        assertThrows(IllegalArgumentException.class, () -> ruleService.validate(List.of(plan1), List.of(), columns));

        // Invalid operator
        RouterPlan plan2 = RouterPlan.builder()
                .nodeId("r2")
                .triggerOn("CHANGED")
                .matchMode("ALL")
                .conditions(List.of(RouterConditionItem.builder().columnName("status").operator("GREATER_THAN").value("1").build()))
                .build();
        assertThrows(IllegalArgumentException.class, () -> ruleService.validate(List.of(plan2), List.of(), columns));

        // Valid plan
        RouterPlan plan3 = RouterPlan.builder()
                .nodeId("r3")
                .triggerOn("CHANGED")
                .matchMode("ALL")
                .conditions(List.of(RouterConditionItem.builder().columnName("status").operator("EQUALS").value("Delivering").build()))
                .build();
        plan3.setActionNodeIds(List.of("a"));
        assertDoesNotThrow(() -> ruleService.validate(List.of(plan3), List.of(ActionPlan.builder().nodeId("a").chatId("123").build()), columns));
    }

    @Test
    void matchesChangedToOperatorCorrectly() {
        RouterPlan router = RouterPlan.builder()
                .nodeId("r1")
                .triggerOn("UPDATED")
                .matchMode("ALL")
                .conditions(List.of(RouterConditionItem.builder().columnName("status").operator("CHANGED_TO").value("Đang giao").build()))
                .build();

        // Matching: previous status was "Chờ xử lý", new status is "Đang giao"
        RecordChangeEvent event1 = RecordChangeEvent.builder()
                .recordId("order-1")
                .kind("UPDATED")
                .before(Map.of("status", "Chờ xử lý", "sku", "SP01"))
                .after(Map.of("status", "Đang giao", "sku", "SP01"))
                .changedColumns(Set.of("status"))
                .build();
        assertTrue(ruleService.matches(router, event1));

        // Not matching: status did not change (was already "Đang giao")
        RecordChangeEvent event2 = RecordChangeEvent.builder()
                .recordId("order-2")
                .kind("UPDATED")
                .before(Map.of("status", "Đang giao", "sku", "SP02"))
                .after(Map.of("status", "Đang giao", "sku", "SP02"))
                .changedColumns(Set.of())
                .build();
        assertFalse(ruleService.matches(router, event2));

        // Not matching on CREATED when operator is CHANGED_TO
        RecordChangeEvent event3 = RecordChangeEvent.builder()
                .recordId("order-3")
                .kind("CREATED")
                .after(Map.of("status", "Đang giao", "sku", "SP03"))
                .changedColumns(Set.of("status"))
                .build();
        assertFalse(ruleService.matches(router, event3));
    }

    @Test
    void matchesEqualsAndContainsAndIsNotEmpty() {
        RouterPlan routerAll = RouterPlan.builder()
                .nodeId("r1")
                .triggerOn("CHANGED")
                .matchMode("ALL")
                .conditions(List.of(
                        RouterConditionItem.builder().columnName("status").operator("CONTAINS").value("giao").build(),
                        RouterConditionItem.builder().columnName("note").operator("IS_NOT_EMPTY").value("").build()
                ))
                .build();

        RecordChangeEvent event = RecordChangeEvent.builder()
                .recordId("order-1")
                .kind("UPDATED")
                .after(Map.of("status", "Đang GIAO hàng", "note", "giao buổi sáng"))
                .changedColumns(Set.of("status"))
                .build();
        assertTrue(ruleService.matches(routerAll, event));

        RecordChangeEvent eventEmptyNote = RecordChangeEvent.builder()
                .recordId("order-2")
                .kind("UPDATED")
                .after(Map.of("status", "Đang GIAO hàng", "note", "   "))
                .changedColumns(Set.of("status"))
                .build();
        assertFalse(ruleService.matches(routerAll, eventEmptyNote));
    }

    @Test
    void conflictedColumnDoesNotSatisfyCondition() {
        RouterPlan router = RouterPlan.builder()
                .nodeId("r1")
                .triggerOn("CHANGED")
                .matchMode("ALL")
                .conditions(List.of(RouterConditionItem.builder().columnName("status").operator("EQUALS").value("Đang giao").build()))
                .build();

        RecordChangeEvent event = RecordChangeEvent.builder()
                .recordId("order-1")
                .kind("UPDATED")
                .after(Map.of("status", "Đang giao"))
                .conflictedColumns(Set.of("status"))
                .changedColumns(Set.of("status"))
                .build();
        assertFalse(ruleService.matches(router, event));
    }

    @Test
    void templateRenderingSubstitutesVariablesAndGeneratesDefaults() {
        Set<String> columns = Set.of("sku", "status", "price");
        assertThrows(IllegalArgumentException.class, () ->
                templateService.validateTemplate("Đơn {sku} có {customer}", columns));
        assertDoesNotThrow(() ->
                templateService.validateTemplate("Đơn {sku} có trạng thái {status}", columns));

        RecordChangeEvent event = RecordChangeEvent.builder()
                .recordId("sp-10")
                .kind("CREATED")
                .after(Map.of("sku", "SP10", "status", "Mới", "price", "50000"))
                .changedColumns(Set.of("sku", "status", "price"))
                .build();

        String customMsg = templateService.renderRecordMessage("📦 Mã {sku} có giá {price}", event, columns);
        assertEquals("📦 Mã SP10 có giá 50000", customMsg);

        String defaultMsg = templateService.renderRecordMessage(null, event, columns);
        assertTrue(defaultMsg.contains("HybridFlow: Bản ghi sp-10 (Tạo mới)"));
        assertTrue(defaultMsg.contains("- status: Mới"));
    }
}
