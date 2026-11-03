package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.service.impl.RuleEvaluationServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RuleBuilderServiceTest {
    private final RuleEvaluationService service = new RuleEvaluationServiceImpl();
    private final List<ActionPlan> actions = List.of(ActionPlan.builder().nodeId("telegram").chatId("123").build());

    private RouterPlan rule(String operator, String value) {
        return RouterPlan.builder().nodeId("rule").triggerOn("UPDATED").matchMode("ALL")
                .conditions(List.of(new RouterConditionItem("quantity", operator, value)))
                .actionNodeIds(List.of("telegram")).build();
    }

    private RecordChangeEvent event(String before, String after) {
        return RecordChangeEvent.builder().recordId("sku-1").kind("UPDATED")
                .before(Map.of("quantity", before)).after(Map.of("quantity", after))
                .changedColumns(before.equals(after) ? Set.of() : Set.of("quantity")).build();
    }

    @ParameterizedTest
    @CsvSource({"LESS_THAN,8,10", "GREATER_THAN,10.01,10", "LESS_OR_EQUAL,-1.25,-1.250",
            "GREATER_OR_EQUAL,10.000,1e1", "LESS_THAN,0.000000000000001,0.000000000000002"})
    void comparesNumbersWithoutChangingTextEquality(String operator, String actual, String expected) {
        RouterPlan router = rule(operator, expected);
        assertDoesNotThrow(() -> service.validate(List.of(router), actions, Set.of("quantity"), Map.of("quantity", "NUMBER")));
        assertTrue(service.matches(router, event("12", actual)));
        assertFalse(service.matches(rule("EQUALS", "1"), event("2", "001")));
        assertFalse(service.matches(rule("CHANGED_TO", "1"), event("2", "001")));
    }

    @Test
    void rejectsNumericRulesOnTextAndInvalidThresholds() {
        assertThrows(IllegalArgumentException.class, () -> service.validate(List.of(rule("LESS_THAN", "10")),
                actions, Set.of("quantity"), Map.of("quantity", "TEXT")));
        for (String value : List.of("", " ", "NaN", "Infinity", "1,000", "1234567890123456", "1e-400")) {
            assertThrows(IllegalArgumentException.class, () -> service.validate(List.of(rule("LESS_THAN", value)),
                    actions, Set.of("quantity"), Map.of("quantity", "NUMBER")));
        }
    }

    @Test
    void invalidNumericDataBlocksTheWholeRuleEvenWhenAnyOtherConditionMatches() {
        RouterPlan router = rule("LESS_THAN", "10");
        router.setMatchMode("ANY");
        router.setConditions(List.of(new RouterConditionItem("status", "EQUALS", "READY"),
                new RouterConditionItem("quantity", "LESS_THAN", "10")));
        for (String value : List.of("", " ", "abc", "NaN", "1,000")) {
            RecordChangeEvent change = event("12", value);
            change.setAfter(Map.of("status", "READY", "quantity", value));
            assertFalse(service.matches(router, change));
        }
    }

    @Test
    void operatorsWithoutValuesAndColumnChangeUseTheEventContract() {
        for (String operator : List.of("IS_EMPTY", "IS_NOT_EMPTY", "COLUMN_CHANGED")) {
            assertDoesNotThrow(() -> service.validate(List.of(rule(operator, null)), actions, Set.of("quantity")));
        }
        assertTrue(service.matches(rule("IS_EMPTY", null), event("12", " ")));
        assertFalse(service.matches(rule("IS_EMPTY", null), event("12", "0")));
        assertTrue(service.matches(rule("COLUMN_CHANGED", null), event("12", "8")));
        assertFalse(service.matches(rule("COLUMN_CHANGED", null), event("8", "8")));
        RecordChangeEvent created = event("12", "8");
        created.setKind("CREATED");
        RouterPlan router = rule("COLUMN_CHANGED", null);
        router.setTriggerOn("CHANGED");
        assertFalse(service.matches(router, created));
    }

    @Test
    void unrelatedConflictsBlockBusinessNotificationsAndUnknownEventsNeverMatch() {
        RecordChangeEvent change = event("12", "8");
        change.setConflictedColumns(Set.of("note"));
        assertFalse(service.matches(rule("LESS_THAN", "10"), change));
        change.setConflictedColumns(Set.of());
        change.setKind("DELETED");
        RouterPlan router = rule("LESS_THAN", "10");
        router.setTriggerOn("CHANGED");
        assertFalse(service.matches(router, change));
    }
}
