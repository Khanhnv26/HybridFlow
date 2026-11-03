package com.hybridflow.sync.util;

import com.hybridflow.connector.google.dto.response.SheetDataResponse;

import java.util.*;


public final class SheetRowUtils {
    private SheetRowUtils() {}

    public static Map<String, Integer> index(SheetDataResponse sheet, String idColumn) {
        List<String> headers = sheet.getHeaders();
        if (headers == null || headers.isEmpty() || headers.stream().anyMatch(h -> h == null || h.isBlank())
                || new HashSet<>(headers).size() != headers.size()) {
            throw new IllegalArgumentException("Trang tính cần hàng tiêu đề không trống, không trùng tên cột.");
        }
        if (!headers.contains(idColumn)) throw new IllegalArgumentException("Không tìm thấy cột khóa: " + idColumn);
        Map<String, Integer> index = new LinkedHashMap<>();
        for (int i = 0; i < sheet.getRows().size(); i++) {
            Map<String, String> row = sheet.getRows().get(i);
            if (row.values().stream().allMatch(v -> v == null || v.isBlank())) continue;
            String id = row.get(idColumn);
            if (id == null || id.isBlank()) throw new IllegalArgumentException("Thiếu khóa ở dòng " + (i + 2));
            if (index.putIfAbsent(id, i) != null) throw new IllegalArgumentException("Khóa bị trùng: " + id);
        }
        return index;
    }

    public static String range(SheetDataResponse sheet, int rowIndex, String column) {
        int col = sheet.getHeaders().indexOf(column) + 1;
        if (col == 0) throw new IllegalArgumentException("Không tìm thấy cột: " + column);
        StringBuilder letters = new StringBuilder();
        while (col > 0) { col--; letters.insert(0, (char) ('A' + col % 26)); col /= 26; }
        return "'" + sheet.getSheetName().replace("'", "''") + "'!" + letters + (rowIndex + 2);
    }
}
