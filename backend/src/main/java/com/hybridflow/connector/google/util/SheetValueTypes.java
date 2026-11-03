package com.hybridflow.connector.google.util;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;

public final class SheetValueTypes {
    private SheetValueTypes() {}

    public static Object rawValue(String value, String type) {
        if (type == null || "TEXT".equals(type)) return value == null ? "" : value;
        if (!"NUMBER".equals(type)) throw new IllegalArgumentException("Kiểu cột phải là TEXT hoặc NUMBER.");
        if (value == null || value.isBlank()) return "";
        String trimmed = value.trim();
        if (!trimmed.matches("[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?"))
            throw new IllegalArgumentException("Giá trị số không hợp lệ: dùng dấu chấm cho phần thập phân, không dùng dấu phân cách hàng nghìn.");
        BigDecimal number = new BigDecimal(trimmed).stripTrailingZeros();
        if (!Double.isFinite(number.doubleValue()) || number.signum() != 0 && number.doubleValue() == 0 || number.precision() > 15)
            throw new IllegalArgumentException("Số vượt độ chính xác 15 chữ số của bảng tính. Hãy dùng kiểu Văn bản cho mã định danh.");
        return number;
    }

    public static String canonical(String value, String type) {
        Object converted = rawValue(value, type);
        return converted instanceof BigDecimal ? ((BigDecimal) converted).toPlainString() : converted.toString();
    }

    public static void validate(Map<String, String> types, Set<String> columns, String idColumn) {
        if (types == null) return;
        for (Map.Entry<String, String> entry : types.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null || !columns.contains(entry.getKey()) || !Set.of("TEXT", "NUMBER").contains(entry.getValue()))
                throw new IllegalArgumentException("Cấu hình kiểu cột không hợp lệ: " + entry.getKey());
            if (entry.getKey().equals(idColumn) && !"TEXT".equals(entry.getValue()))
                throw new IllegalArgumentException("Cột khóa phải giữ kiểu Văn bản.");
        }
    }
}
