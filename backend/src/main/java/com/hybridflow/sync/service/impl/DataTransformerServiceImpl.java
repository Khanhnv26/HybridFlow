package com.hybridflow.sync.service.impl;

import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.sync.dto.request.ColumnTransformConfig;
import com.hybridflow.sync.service.DataTransformerService;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class DataTransformerServiceImpl implements DataTransformerService {
    private static final Pattern SPACE = Pattern.compile("[\\s\\p{Z}]+", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern PHONE_FORMAT = Pattern.compile("[\\s\\p{Z}().-]");
    private static final Pattern LOCAL_PHONE = Pattern.compile("0[1-9][0-9]{8,9}");
    private static final Pattern INTERNATIONAL_PHONE = Pattern.compile("(?:84|\\+84|0084)[1-9][0-9]{8,9}");
    private static final Set<String> RULES = Set.of("TRIM", "UPPERCASE", "LOWERCASE", "CAPITALIZE", "PHONE_VN", "DEFAULT_IF_EMPTY");

    @Override
    public Map<String, String> transformRow(Map<String, String> row, List<ColumnTransformConfig> configs) {
        validate(row.keySet(), configs);
        return apply(row, configs);
    }

    private Map<String, String> apply(Map<String, String> row, List<ColumnTransformConfig> configs) {
        Map<String, String> result = new LinkedHashMap<>(row);
        if (configs == null) return result;
        for (ColumnTransformConfig config : configs) {
            String value = result.get(config.getColumnName());
            for (String rule : config.getRules()) {
                if ("DEFAULT_IF_EMPTY".equals(rule)) {
                    if (value == null || SPACE.matcher(value).replaceAll("").isEmpty()) value = config.getDefaultValue() == null ? "" : config.getDefaultValue();
                } else if (value != null) {
                    value = switch (rule) {
                        case "TRIM" -> SPACE.matcher(value).replaceAll(" ").trim();
                        case "UPPERCASE" -> value.toUpperCase(Locale.ROOT);
                        case "LOWERCASE" -> value.toLowerCase(Locale.ROOT);
                        case "CAPITALIZE" -> capitalize(value);
                        case "PHONE_VN" -> phone(value);
                        default -> throw new ValidationException("Quy tắc chuẩn hóa không hợp lệ: " + rule);
                    };
                }
            }
            result.put(config.getColumnName(), value);
        }
        return result;
    }

    private void validate(Set<String> columns, List<ColumnTransformConfig> configs) {
        if (configs == null) return;
        Set<String> seen = new HashSet<>();
        for (ColumnTransformConfig config : configs) {
            if (config == null || config.getColumnName() == null || !columns.contains(config.getColumnName())
                    || !seen.add(config.getColumnName()) || config.getRules() == null
                    || config.getRules().stream().anyMatch(rule -> rule == null || !RULES.contains(rule)))
                throw new ValidationException("Cột hoặc quy tắc chuẩn hóa không hợp lệ.");
        }
    }

    @Override
    public List<Map<String, String>> transformRows(List<Map<String, String>> rows, List<ColumnTransformConfig> configs) {
        if (!rows.isEmpty()) validate(rows.getFirst().keySet(), configs);
        return rows.stream().map(row -> apply(row, configs)).toList();
    }

    private String capitalize(String value) {
        StringBuilder out = new StringBuilder();
        boolean start = true;
        for (int cp : value.toLowerCase(Locale.ROOT).codePoints().toArray()) {
            out.appendCodePoint(start ? Character.toTitleCase(cp) : cp);
            start = Character.isWhitespace(cp) || Character.isSpaceChar(cp);
        }
        return out.toString();
    }

    private String phone(String value) {
        String compact = PHONE_FORMAT.matcher(value).replaceAll("");
        if (LOCAL_PHONE.matcher(compact).matches()) return "+84" + compact.substring(1);
        if (INTERNATIONAL_PHONE.matcher(compact).matches())
            return "+84" + compact.substring(compact.startsWith("0084") ? 4 : compact.startsWith("+") ? 3 : 2);
        return value;
    }
}
