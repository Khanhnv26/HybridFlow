package com.hybridflow.sync.service.impl;

import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.service.RuleEvaluationService;
import com.hybridflow.sync.util.RuleOperators;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class RuleEvaluationServiceImpl implements RuleEvaluationService {

    private static final Set<String> ALLOWED_TRIGGERS = Set.of("CHANGED", "CREATED", "UPDATED");
    private static final Set<String> ALLOWED_MATCH_MODES = Set.of("ALL", "ANY");

    @Override
    public void validate(List<RouterPlan> routers, List<ActionPlan> actions, Set<String> availableColumns) {
        validate(routers, actions, availableColumns, Map.of());
    }

    @Override
    public void validate(List<RouterPlan> routers, List<ActionPlan> actions, Set<String> availableColumns, Map<String, String> columnTypes) {
        if (routers == null) routers = List.of();
        if (actions == null) actions = List.of();
        Set<String> actionIds = new HashSet<>();
        for (ActionPlan action : actions) {
            if (action == null || action.getNodeId() == null || action.getNodeId().isBlank()
                    || !actionIds.add(action.getNodeId())) throw new ValidationException("Mã khối thông báo không hợp lệ hoặc bị trùng.");
            if (action.getChatId() == null || action.getChatId().isBlank()) throw new ValidationException("Điền Telegram Chat ID.");
            if (action.getChannel() != null && !"TELEGRAM".equals(action.getChannel())) throw new ValidationException("Kênh thông báo không hợp lệ.");
        }
        for (RouterPlan router : routers) {
            if (router.getActionNodeIds() == null || router.getActionNodeIds().isEmpty()
                    || !actionIds.containsAll(router.getActionNodeIds())) throw new ValidationException("Rẽ nhánh cần đích thông báo hợp lệ.");
            String triggerOn = router.getTriggerOn() == null ? "CHANGED" : router.getTriggerOn();
            if (!ALLOWED_TRIGGERS.contains(triggerOn)) {
                throw new ValidationException("Điều kiện kích hoạt KHI không hợp lệ: " + triggerOn);
            }
            String matchMode = router.getMatchMode() == null ? "ALL" : router.getMatchMode();
            if (!ALLOWED_MATCH_MODES.contains(matchMode)) {
                throw new ValidationException("Chế độ kết hợp điều kiện không hợp lệ: " + matchMode);
            }
            List<RouterConditionItem> conditions = router.getConditions();
            if (conditions == null || conditions.isEmpty()) {
                throw new ValidationException("Khối Rẽ Nhánh Điều Kiện cần ít nhất một điều kiện NẾU.");
            }
            for (RouterConditionItem item : conditions) {
                RuleOperators.validate(item, columnTypes);
                if (!availableColumns.contains(item.getColumnName())) {
                    throw new ValidationException("Cột điều kiện không tồn tại trong luồng: " + item.getColumnName());
                }
            }
        }
    }

    @Override
    public boolean matches(RouterPlan router, RecordChangeEvent event) {
        if (router == null || event == null) {
            return false;
        }
        if (!Set.of("CREATED", "UPDATED").contains(event.getKind() == null ? "" : event.getKind())
                || event.getConflictedColumns() != null && !event.getConflictedColumns().isEmpty()) {
            return false;
        }
        String triggerOn = router.getTriggerOn() == null ? "CHANGED" : router.getTriggerOn();
        if ("CREATED".equals(triggerOn) && !"CREATED".equals(event.getKind())) {
            return false;
        }
        if ("UPDATED".equals(triggerOn) && !"UPDATED".equals(event.getKind())) {
            return false;
        }
        List<RouterConditionItem> conditions = router.getConditions();
        if (conditions == null || conditions.isEmpty()) {
            return false;
        }
        // Validate every numeric operand before ANY can short-circuit to a match.
        for (RouterConditionItem condition : conditions) {
            if (RuleOperators.isNumeric(condition.getOperator())) {
                try {
                    RuleOperators.number(event.getAfter() == null ? null : event.getAfter().get(condition.getColumnName()));
                    RuleOperators.number(condition.getValue());
                } catch (IllegalArgumentException error) {
                    log.warn("Bỏ qua rule {}: cột {} không có giá trị số hợp lệ.", router.getNodeId(), condition.getColumnName());
                    return false;
                }
            }
        }
        String matchMode = router.getMatchMode() == null ? "ALL" : router.getMatchMode();
        boolean isAll = "ALL".equalsIgnoreCase(matchMode);

        for (RouterConditionItem item : conditions) {
            boolean satisfied = evaluateCondition(item, event);
            if (isAll && !satisfied) {
                return false;
            }
            if (!isAll && satisfied) {
                return true;
            }
        }
        return isAll;
    }

    private boolean evaluateCondition(RouterConditionItem condition, RecordChangeEvent event) {
        String col = condition.getColumnName();
        if (event.getConflictedColumns() != null && event.getConflictedColumns().contains(col)) {
            return false;
        }
        String beforeVal = event.getBefore() != null ? event.getBefore().getOrDefault(col, "") : "";
        String afterVal = event.getAfter() != null ? event.getAfter().getOrDefault(col, "") : "";
        String expected = condition.getValue() == null ? "" : condition.getValue();

        switch (condition.getOperator()) {
            case "CHANGED_TO":
                return "UPDATED".equals(event.getKind())
                        && !Objects.equals(beforeVal, afterVal)
                        && Objects.equals(afterVal, expected);
            case "EQUALS":
                return Objects.equals(afterVal, expected);
            case "NOT_EQUALS":
                return !Objects.equals(afterVal, expected);
            case "CONTAINS":
                return afterVal.toLowerCase(Locale.ROOT).contains(expected.toLowerCase(Locale.ROOT));
            case "GREATER_THAN":
                return RuleOperators.number(afterVal).compareTo(RuleOperators.number(expected)) > 0;
            case "LESS_THAN":
                return RuleOperators.number(afterVal).compareTo(RuleOperators.number(expected)) < 0;
            case "GREATER_OR_EQUAL":
                return RuleOperators.number(afterVal).compareTo(RuleOperators.number(expected)) >= 0;
            case "LESS_OR_EQUAL":
                return RuleOperators.number(afterVal).compareTo(RuleOperators.number(expected)) <= 0;
            case "COLUMN_CHANGED":
                return "UPDATED".equals(event.getKind()) && event.getChangedColumns() != null
                        && event.getChangedColumns().contains(col) && !Objects.equals(beforeVal, afterVal);
            case "IS_EMPTY":
                return afterVal.trim().isEmpty();
            case "IS_NOT_EMPTY":
                return !afterVal.trim().isEmpty();
            default:
                return false;
        }
    }
}
