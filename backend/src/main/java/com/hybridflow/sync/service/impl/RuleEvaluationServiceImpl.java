package com.hybridflow.sync.service.impl;

import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.service.RuleEvaluationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class RuleEvaluationServiceImpl implements RuleEvaluationService {

    private static final Set<String> ALLOWED_OPERATORS = Set.of(
            "CHANGED_TO", "EQUALS", "NOT_EQUALS", "CONTAINS", "IS_NOT_EMPTY"
    );
    private static final Set<String> ALLOWED_TRIGGERS = Set.of("CHANGED", "CREATED", "UPDATED");
    private static final Set<String> ALLOWED_MATCH_MODES = Set.of("ALL", "ANY");

    @Override
    public void validate(List<RouterPlan> routers, List<ActionPlan> actions, Set<String> availableColumns) {
        if (routers == null) routers = List.of();
        if (actions == null) actions = List.of();
        Set<String> actionIds = new java.util.HashSet<>();
        for (ActionPlan action : actions) {
            if (action == null || action.getNodeId() == null || action.getNodeId().isBlank()
                    || !actionIds.add(action.getNodeId())) throw new IllegalArgumentException("Mã khối thông báo không hợp lệ hoặc bị trùng.");
            if (action.getChatId() == null || action.getChatId().isBlank()) throw new IllegalArgumentException("Điền Telegram Chat ID.");
            if (action.getChannel() != null && !"TELEGRAM".equals(action.getChannel())) throw new IllegalArgumentException("Kênh thông báo không hợp lệ.");
        }
        for (RouterPlan router : routers) {
            if (router.getActionNodeIds() == null || router.getActionNodeIds().isEmpty()
                    || !actionIds.containsAll(router.getActionNodeIds())) throw new IllegalArgumentException("Rẽ nhánh cần đích thông báo hợp lệ.");
            String triggerOn = router.getTriggerOn() == null ? "CHANGED" : router.getTriggerOn();
            if (!ALLOWED_TRIGGERS.contains(triggerOn)) {
                throw new IllegalArgumentException("Điều kiện kích hoạt KHI không hợp lệ: " + triggerOn);
            }
            String matchMode = router.getMatchMode() == null ? "ALL" : router.getMatchMode();
            if (!ALLOWED_MATCH_MODES.contains(matchMode)) {
                throw new IllegalArgumentException("Chế độ kết hợp điều kiện không hợp lệ: " + matchMode);
            }
            List<RouterConditionItem> conditions = router.getConditions();
            if (conditions == null || conditions.isEmpty()) {
                throw new IllegalArgumentException("Khối Rẽ Nhánh Điều Kiện cần ít nhất một điều kiện NẾU.");
            }
            for (RouterConditionItem item : conditions) {
                if (item.getColumnName() == null || item.getColumnName().isBlank()) {
                    throw new IllegalArgumentException("Cột điều kiện không được để trống.");
                }
                if (!availableColumns.contains(item.getColumnName())) {
                    throw new IllegalArgumentException("Cột điều kiện không tồn tại trong luồng: " + item.getColumnName());
                }
                if (item.getOperator() == null || !ALLOWED_OPERATORS.contains(item.getOperator())) {
                    throw new IllegalArgumentException("Phép toán điều kiện không hợp lệ: " + item.getOperator());
                }
                if (!"IS_NOT_EMPTY".equals(item.getOperator()) && item.getValue() == null) {
                    throw new IllegalArgumentException("Giá trị so sánh không được null.");
                }
            }
        }
    }

    @Override
    public boolean matches(RouterPlan router, RecordChangeEvent event) {
        if (router == null || event == null) {
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
            case "IS_NOT_EMPTY":
                return !afterVal.trim().isEmpty();
            default:
                return false;
        }
    }
}
