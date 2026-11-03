package com.hybridflow.sync.service.impl;

import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.service.NotificationTemplateService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class NotificationTemplateServiceImpl implements NotificationTemplateService {

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{([^}]+)\\}");

    @Override
    public void validateConflictTemplate(String template) {
        validateTemplate(template, Set.of("recordId", "columnName", "baseValue", "valueA", "valueB", "id", "column"));
    }

    @Override
    public void validateTemplate(String template, Set<String> availableColumns) {
        if (template == null || template.isBlank()) {
            return;
        }
        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        while (matcher.find()) {
            String variableName = matcher.group(1).trim();
            if (!availableColumns.contains(variableName)) {
                throw new ValidationException("Biến template không tồn tại trong danh sách cột: " + variableName);
            }
        }
    }

    @Override
    public String renderRecordMessage(String template, RecordChangeEvent event, Set<String> syncColumns) {
        if (template != null && !template.isBlank()) {
            StringBuilder sb = new StringBuilder();
            Matcher matcher = VARIABLE_PATTERN.matcher(template);
            Map<String, String> after = event.getAfter() != null ? event.getAfter() : Map.of();
            while (matcher.find()) {
                String variableName = matcher.group(1).trim();
                String value = after.getOrDefault(variableName, "");
                matcher.appendReplacement(sb, Matcher.quoteReplacement(value));
            }
            matcher.appendTail(sb);
            return sb.toString();
        }

        // Default clean message
        String actionText = "CREATED".equals(event.getKind()) ? "Tạo mới" : "Cập nhật";
        StringBuilder sb = new StringBuilder();
        sb.append("HybridFlow: Bản ghi ").append(event.getRecordId())
                .append(" (").append(actionText).append(")\n");
        if (event.getAfter() != null) {
            Set<String> colsToShow = event.getChangedColumns() != null && !event.getChangedColumns().isEmpty()
                    ? event.getChangedColumns()
                    : syncColumns;
            if (colsToShow != null) {
                for (String col : colsToShow) {
                    sb.append("- ").append(col).append(": ")
                            .append(event.getAfter().getOrDefault(col, ""))
                            .append("\n");
                }
            }
        }
        return sb.toString().trim();
    }

    @Override
    public String renderConflictMessage(String template, SyncConflict conflict) {
        if (template != null && !template.isBlank()) {
            Map<String, String> values = Map.of("recordId", value(conflict.getRecordId()), "id", value(conflict.getRecordId()),
                    "columnName", value(conflict.getColumnName()), "column", value(conflict.getColumnName()),
                    "baseValue", value(conflict.getBaseValue()), "valueA", value(conflict.getValueA()), "valueB", value(conflict.getValueB()));
            StringBuilder rendered = new StringBuilder();
            Matcher matcher = VARIABLE_PATTERN.matcher(template);
            while (matcher.find()) matcher.appendReplacement(rendered, Matcher.quoteReplacement(values.getOrDefault(matcher.group(1).trim(), "")));
            matcher.appendTail(rendered);
            return rendered.toString();
        }

        return """
                HybridFlow: Có dữ liệu cần bạn xử lý
                Bản ghi: %s
                Trường dữ liệu: %s
                Giá trị ban đầu: %s
                Google Sheet: %s
                Kho lưu trữ: %s
                Mở HybridFlow để xem và chọn giá trị muốn giữ.
                """.formatted(
                conflict.getRecordId(),
                conflict.getColumnName(),
                conflict.getBaseValue(),
                conflict.getValueA(),
                conflict.getValueB()
        );
    }

    private String value(String value) { return value == null ? "" : value; }
}
