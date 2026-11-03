package com.hybridflow.sync.util;

import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class SheetRowUtils {
    public static String valueType(SheetDataResponse sheet, int row, String column) {
        return sheet.getValueTypes() != null && row < sheet.getValueTypes().size()
                ? sheet.getValueTypes().get(row).getOrDefault(column, "TEXT") : "TEXT";
    }

    public static boolean requiresTypeWrite(SheetDataResponse sheet, int row,
                                            String column, String value, Map<String, String> columnTypes) {
        return columnTypes != null && columnTypes.containsKey(column) && value != null && !value.isEmpty()
                && sheet.getValueTypes() != null && !columnTypes.get(column).equals(valueType(sheet, row, column));
    }
    private SheetRowUtils() {}

    public static Map<String, Integer> index(SheetDataResponse sheet, String idColumn) {
        List<String> headers = sheet.getHeaders();
        if (headers == null || headers.isEmpty() || headers.stream().anyMatch(h -> h == null || h.isBlank())
                || new HashSet<>(headers).size() != headers.size()) {
            throw new ValidationException("Trang tính cần hàng tiêu đề không trống, không trùng tên cột.");
        }
        if (!headers.contains(idColumn)) throw new ValidationException("Không tìm thấy cột khóa: " + idColumn);
        Map<String, Integer> index = new LinkedHashMap<>();
        for (int i = 0; i < sheet.getRows().size(); i++) {
            Map<String, String> row = sheet.getRows().get(i);
            if (row.values().stream().allMatch(v -> v == null || v.isBlank())) continue;
            String id = row.get(idColumn);
            if (id == null || id.isBlank()) throw new ValidationException("Thiếu khóa ở dòng " + (i + 2));
            if (index.putIfAbsent(id, i) != null) throw new ValidationException("Khóa bị trùng: " + id);
        }
        return index;
    }

    public static String range(SheetDataResponse sheet, int rowIndex, String column) {
        int col = sheet.getHeaders().indexOf(column) + 1;
        if (col == 0) throw new ValidationException("Không tìm thấy cột: " + column);
        StringBuilder letters = new StringBuilder();
        while (col > 0) { col--; letters.insert(0, (char) ('A' + col % 26)); col /= 26; }
        return "'" + sheet.getSheetName().replace("'", "''") + "'!" + letters + (rowIndex + 2);
    }
}
