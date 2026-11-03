package com.hybridflow.sync.util;

import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connector.google.util.SheetValueTypes;
import com.hybridflow.sync.dto.request.RouterConditionItem;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;

public final class RuleOperators {
    private static final Set<String> ALLOWED = Set.of(
            "CHANGED_TO", "EQUALS", "NOT_EQUALS", "CONTAINS", "IS_NOT_EMPTY", "IS_EMPTY",
            "COLUMN_CHANGED", "GREATER_THAN", "LESS_THAN", "GREATER_OR_EQUAL", "LESS_OR_EQUAL");
    private static final Set<String> NUMERIC = Set.of(
            "GREATER_THAN", "LESS_THAN", "GREATER_OR_EQUAL", "LESS_OR_EQUAL");
    private static final Set<String> WITHOUT_VALUE = Set.of("IS_EMPTY", "IS_NOT_EMPTY", "COLUMN_CHANGED");

    private RuleOperators() {}

    public static boolean isNumeric(String operator) {
        return operator != null && NUMERIC.contains(operator);
    }

    public static BigDecimal number(String value) {
        Object converted = SheetValueTypes.rawValue(value, "NUMBER");
        if (!(converted instanceof BigDecimal)) {
            throw new ValidationException("Giá trị so sánh số không được để trống.");
        }
        return (BigDecimal) converted;
    }

    public static void validate(RouterConditionItem condition, Map<String, String> columnTypes) {
        if (condition == null || condition.getColumnName() == null || condition.getColumnName().isBlank()) {
            throw new ValidationException("Cột điều kiện không được để trống.");
        }
        String operator = condition.getOperator();
        if (operator == null || !ALLOWED.contains(operator)) {
            throw new ValidationException("Phép toán điều kiện không hợp lệ: " + operator);
        }
        if (!WITHOUT_VALUE.contains(operator) && condition.getValue() == null) {
            throw new ValidationException("Giá trị so sánh không được null.");
        }
        if (isNumeric(operator)) {
            if (columnTypes == null || !"NUMBER".equals(columnTypes.get(condition.getColumnName()))) {
                throw new ValidationException("Chọn kiểu Số cho cột " + condition.getColumnName() + " trước khi so sánh số.");
            }
            number(condition.getValue());
        }
    }
}
