package com.hybridflow.sync.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.ColumnTransformConfig;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.request.SheetWriteTargetPlan;
import com.hybridflow.sync.model.ParsedSchedule;
import com.hybridflow.sync.util.RuleOperators;
import com.hybridflow.workspace.dto.request.SheetWritePreviewRequest;
import org.springframework.stereotype.Component;

import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Component
public class WorkflowGraphParser {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT);

    public ParsedSchedule extractSchedule(JsonNode definition, Instant now) {
        if (definition == null) {
            return ParsedSchedule.disable();
        }
        JsonNode nodes = definition.path("nodes");
        JsonNode edges = definition.path("edges");

        if (!nodes.isArray() || !edges.isArray()) {
            return ParsedSchedule.disable();
        }

        JsonNode diffNode = findFirstByType(nodes, "diffEngine");
        JsonNode scheduleNode = findFirstByType(nodes, "scheduleTrigger");
        if (count(nodes, "scheduleTrigger") > 1) throw new ValidationException("Chỉ hỗ trợ một khối hẹn giờ trong mỗi luồng.");

        if (diffNode == null || scheduleNode == null) {
            return ParsedSchedule.disable();
        }

        String scheduleId = scheduleNode.path("id").asText("");
        String diffId = diffNode.path("id").asText("");

        boolean wiredToTriggerPort = false;

        for (JsonNode edge : edges) {
            String source = edge.path("source").asText("");
            String sourceHandle = edge.path("sourceHandle").asText("out");
            String target = edge.path("target").asText("");
            String targetHandle = edge.path("targetHandle").asText("");

            if (scheduleId.equals(source)
                    && "out".equals(sourceHandle)
                    && diffId.equals(target)
                    && "trigger".equals(targetHandle)) {
                wiredToTriggerPort = true;
                break;
            }
        }

        JsonNode data = scheduleNode.path("data");
        boolean enabled = wiredToTriggerPort && data.path("scheduleEnabled").asBoolean(true);
        String type = data.path("scheduleType").asText("interval");
        int intervalMinutes = data.path("scheduleIntervalMinutes").asInt(5);
        String dailyTime = data.path("scheduleTime").asText("08:00");
        String timezone = data.path("scheduleTimezone").asText("Asia/Ho_Chi_Minh");
        if (!Set.of("interval", "daily").contains(type)) throw new ValidationException("Kiểu lịch không hợp lệ.");
        if (intervalMinutes < 1 || intervalMinutes > 1440 || !data.path("scheduleIntervalMinutes").isMissingNode()
                && !data.path("scheduleIntervalMinutes").isIntegralNumber())
            throw new ValidationException("Chu kỳ phải là số nguyên từ 1 đến 1440 phút.");
        try { ZoneId.of(timezone); LocalTime.parse(dailyTime, TIME_FORMATTER); }
        catch (Exception exception) { throw new ValidationException("Giờ chạy hoặc múi giờ không hợp lệ."); }

        Instant nextRunAt = enabled ? computeNextRun(type, intervalMinutes, dailyTime, timezone, now) : null;

        return ParsedSchedule.builder()
                .enabled(enabled)
                .scheduleType(type)
                .intervalMinutes(intervalMinutes)
                .dailyTime(dailyTime)
                .timezone(timezone)
                .nextRunAt(nextRunAt)
                .build();
    }

    public Optional<RunSyncRequest> buildSyncRequest(String flowId, JsonNode definition, String accessToken) {
        if (accessToken == null || accessToken.isBlank() || definition == null) {
            return Optional.empty();
        }

        Map<String, List<String>> transformNodes = new LinkedHashMap<>();
        for (JsonNode node : definition.path("nodes")) if ("dataTransform".equals(node.path("type").asText())) {
            String transformId = node.path("id").asText();
            transformNodes.put("transforms", Stream.concat(transformNodes.getOrDefault("transforms", List.of()).stream(), Stream.of(transformId)).toList());
            for (JsonNode edge : definition.path("edges")) if (transformId.equals(edge.path("target").asText()))
                transformNodes.put("transform:" + edge.path("source").asText(), List.of(transformId, edge.path("source").asText()));
        }
        definition = normalizeTransforms(definition);
        JsonNode nodes = definition.path("nodes");
        JsonNode edges = definition.path("edges");
        if (!nodes.isArray() || !edges.isArray()) throw new ValidationException("Cấu hình luồng không hợp lệ.");
        Set<String> supported = Set.of("sheetsTrigger", "scheduleTrigger", "diffEngine", "storageAction", "telegramAction", "routerCondition", "sheetWriteAction");
        Set<String> ids = new LinkedHashSet<>();
        for (JsonNode node : nodes) {
            if (!supported.contains(node.path("type").asText()) || node.path("id").asText().isBlank()
                    || !ids.add(node.path("id").asText())) throw new ValidationException("Luồng có khối không hợp lệ hoặc chưa hỗ trợ.");
        }
        if (count(nodes, "diffEngine") != 1 || count(nodes, "scheduleTrigger") > 1)
            throw new ValidationException("Luồng cần một khối So khớp và tối đa một hẹn giờ.");
        JsonNode diffNode = findFirstByType(nodes, "diffEngine");

        if (diffNode == null) {
            return Optional.empty();
        }

        String diffId = diffNode.path("id").asText("");
        JsonNode diffData = diffNode.path("data");
        String idColumn = diffData.path("uniqueKey").asText("").trim();
        String conflictPolicy = diffData.path("conflictPolicy").asText("");
        if (idColumn.isBlank() || !Set.of("ASK_TELEGRAM", "SOURCE_WINS", "DESTINATION_WINS").contains(conflictPolicy))
            throw new ValidationException("Cột khóa hoặc chính sách xung đột không hợp lệ.");

        Set<String> syncColumns = Arrays.stream(diffData.path("sharedColumns").asText("").split(","))
                .map(String::trim)
                .filter(col -> !col.isEmpty() && !col.equals(idColumn))
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<SheetEndpointRequest> connectedSheets = new ArrayList<SheetEndpointRequest>();

        int index = 1;
        for (JsonNode node : nodes) {
            if (!"sheetsTrigger".equals(node.path("type").asText(""))) {
                continue;
            }
            String nodeId = node.path("id").asText("");
            if (!isSheetConnected(edges, nodeId, diffId)) {
                throw new ValidationException("Hãy nối tất cả khối Sheet vào So khớp.");
            }
            JsonNode sheetData = node.path("data");
            String spreadsheetId = sheetData.path("spreadsheetId").asText("").trim();
            String sheetName = sheetData.path("sheetName").asText("").trim();
            if (spreadsheetId.isEmpty() || sheetName.isEmpty()) {
                throw new ValidationException("Điền đủ file và tên trang tính.");
            }
            SheetEndpointRequest endpoint = SheetEndpointRequest.builder()
                    .nodeId(nodeId)
                    .label(sheetData.path("label").asText("Sheet " + index) + " (" + sheetName + ")")
                    .spreadsheetId(spreadsheetId)
                    .spreadsheetTitle(sheetData.path("spreadsheetTitle").asText(null))
                    .sheetName(sheetName)
                    .transforms(readTransforms(sheetData.path("transforms")))
                    .writeBackCleanData(sheetData.path("writeBackCleanData").asBoolean(false))
                    .build();
            connectedSheets.add(endpoint);
            index++;
        }

        if (connectedSheets.isEmpty()) {
            throw new ValidationException("Luồng cần nguồn Google Sheet.");
        }

        JsonNode storageNode = findFirstByType(nodes, "storageAction");
        String storageName = "vault";
        if (storageNode != null) {
            storageName = storageNode.path("data").path("tableName").asText("").trim();
        }
        boolean multi = connectedSheets.size() >= 2;
        if (!diffData.path("sharedColumns").asText("").isBlank() && syncColumns.isEmpty())
            throw new ValidationException("Chọn ít nhất một cột dữ liệu ngoài cột khóa.");

        Set<String> endpoints = new LinkedHashSet<>();
        for (SheetEndpointRequest sheet : connectedSheets) {
            if (!endpoints.add(sheet.getSpreadsheetId() + "\n" + sheet.getSheetName()))
                throw new ValidationException("Không được nối hai khối vào cùng file và trang tính.");
        }

        if (multi && (storageNode != null || syncColumns.isEmpty()))
            throw new ValidationException("Luồng nhiều Sheet cần chọn cột chia sẻ và không có khối Kho.");
        JsonNode sheetWriteNode = findFirstByType(nodes, "sheetWriteAction");

        if (count(nodes, "sheetWriteAction") > 1)
            throw new ValidationException("Chỉ hỗ trợ một khối Ghi Sheet trong mỗi luồng.");

        SheetWriteTargetPlan sheetWriteTargetPlan = null;
        if (sheetWriteNode != null) {
            if (multi) throw new ValidationException("Khối Ghi về bảng tính cần luồng một Sheet nguồn và Kho.");
            String swId = sheetWriteNode.path("id").asText();
            if (!hasEdge(edges, diffId, "clean", swId, "in")) {
                throw new ValidationException("Khối Ghi về bảng tính phải được nối từ cổng Hành động (clean) của khối So khớp.");
            }
            JsonNode data = sheetWriteNode.path("data");
            String targetSpreadsheetId = data.path("targetSpreadsheetId").asText(data.path("spreadsheetId").asText("")).trim();
            String targetSheetName = data.path("targetSheetName").asText(data.path("sheetName").asText("")).trim();
            String targetKey = data.path("targetKeyColumn").asText("").trim();
            String sourceKey = data.path("sourceKeyColumn").asText("").trim();
            if (sourceKey.isBlank()) {
                sourceKey = idColumn;
            }
            List<SheetWritePreviewRequest.ColumnMappingItem> columnMappings = new ArrayList<>();
            JsonNode mappingsNode = data.path("columnMappings");
            if (mappingsNode.isArray()) {
                for (JsonNode m : mappingsNode) {
                    String srcCol = m.path("sourceColumn").asText("").trim();
                    String tgtCol = m.path("targetColumn").asText("").trim();
                    if (!srcCol.isBlank() && !tgtCol.isBlank()) {
                        columnMappings.add(new SheetWritePreviewRequest.ColumnMappingItem(srcCol, tgtCol));
                    }
                }
            }
            if (targetSpreadsheetId.isBlank() || targetSheetName.isBlank() || targetKey.isBlank() || columnMappings.isEmpty()) {
                throw new ValidationException("Khối Ghi về bảng tính chưa được cấu hình đầy đủ (file đích, tab đích, khóa đích, ánh xạ cột).");
            }
            sheetWriteTargetPlan = SheetWriteTargetPlan.builder()
                    .nodeId(swId)
                    .targetSpreadSheetId(targetSpreadsheetId)
                    .targetSheetName(targetSheetName)
                    .sourceKeyColumn(sourceKey)
                    .targetKeyColumn(targetKey)
                    .columnMappings(columnMappings)
                    .build();
        }

        if (!multi && (count(nodes, "storageAction") != 1 || storageName.isBlank()
                || !hasEdge(edges, connectedSheets.get(0).getNodeId(), "out", diffId, "in")
                || !hasEdge(edges, diffId, "clean", storageNode.path("id").asText(), "in")))
            throw new ValidationException("Nối Google Sheet → So khớp → Kho lưu trữ trước khi chạy.");
        if (multi) storageName = "multi_sheet";

        List<JsonNode> routerNodes = new ArrayList<>();
        for (JsonNode node : nodes) {
            if ("routerCondition".equals(node.path("type").asText(""))) {
                routerNodes.add(node);
            }
        }
        List<JsonNode> telegramNodes = new ArrayList<>();
        for (JsonNode node : nodes) {
            if ("telegramAction".equals(node.path("type").asText(""))) {
                telegramNodes.add(node);
            }
        }

        Set<String> edgeSignatures = new LinkedHashSet<>();
        for (JsonNode edge : edges) {
            String sig = edge.path("source").asText("") + ":" + edge.path("sourceHandle").asText("")
                    + "->" + edge.path("target").asText("") + ":" + edge.path("targetHandle").asText("");
            if (!edgeSignatures.add(sig)) {
                throw new ValidationException("Có dây nối trùng lặp trong luồng.");
            }
        }

        Map<String, String> columnTypes = new TreeMap<>();
        if (diffData.has("columnTypes")) {
            if (!diffData.path("columnTypes").isObject()) throw new ValidationException("Cấu hình kiểu cột không hợp lệ.");
            diffData.path("columnTypes").fields().forEachRemaining(entry -> columnTypes.put(entry.getKey(), entry.getValue().asText()));
            for (String type : columnTypes.values()) if (!Set.of("TEXT", "NUMBER").contains(type)) throw new ValidationException("Kiểu cột không hợp lệ.");
            if ("NUMBER".equals(columnTypes.get(idColumn))) throw new ValidationException("Cột khóa phải giữ kiểu Văn bản.");
        }

        List<RouterPlan> routerPlans = new ArrayList<>();
        for (JsonNode rNode : routerNodes) {
            String rId = rNode.path("id").asText("");
            if (!hasEdge(edges, diffId, "clean", rId, "in")) {
                throw new ValidationException("Khối Rẽ Nhánh Điều Kiện phải được nối từ cổng Hành động của khối So khớp.");
            }
            for (JsonNode edge : edges) {
                if (rId.equals(edge.path("target").asText("")) && (!diffId.equals(edge.path("source").asText()) || !"clean".equals(edge.path("sourceHandle").asText()) || !"in".equals(edge.path("targetHandle").asText()))) {
                    throw new ValidationException("Đường vào khối Rẽ Nhánh Điều Kiện không hợp lệ.");
                }
            }
            List<String> actionTargets = new ArrayList<>();
            for (JsonNode edge : edges) {
                if (rId.equals(edge.path("source").asText(""))) {
                    if (!"out".equals(edge.path("sourceHandle").asText("")) || !"in".equals(edge.path("targetHandle").asText())) {
                        throw new ValidationException("Đường ra khối Rẽ Nhánh Điều Kiện không hợp lệ.");
                    }
                    String targetId = edge.path("target").asText("");
                    boolean isTelegram = telegramNodes.stream().anyMatch(t -> t.path("id").asText("").equals(targetId));
                    if (!isTelegram) {
                        throw new ValidationException("Khối Rẽ Nhánh Điều Kiện chỉ được nối tới khối thông báo.");
                    }
                    actionTargets.add(targetId);
                }
            }
            if (actionTargets.isEmpty()) {
                throw new ValidationException("Khối Rẽ Nhánh Điều Kiện cần nối tới ít nhất một khối thông báo.");
            }

            JsonNode rData = rNode.path("data");
            String triggerOn = rData.path("routerTriggerOn").asText(rData.path("triggerOn").asText("CHANGED"));
            String matchMode = rData.path("routerMatchMode").asText(rData.path("matchMode").asText("ALL"));
            List<RouterConditionItem> conditions = new ArrayList<>();
            JsonNode condArray = rData.has("routerConditions") ? rData.path("routerConditions") : rData.path("conditions");
            if (condArray.isArray()) {
                for (JsonNode cNode : condArray) {
                    conditions.add(RouterConditionItem.builder()
                            .columnName(cNode.path("columnName").asText("").trim())
                            .operator(cNode.path("operator").asText("").trim())
                            .value(cNode.hasNonNull("value") ? cNode.path("value").asText() : null)
                            .build());
                }
            }
            if (conditions.isEmpty()) {
                throw new ValidationException("Khối Rẽ Nhánh Điều Kiện cần ít nhất một điều kiện.");
            }
            if (!Set.of("CHANGED", "CREATED", "UPDATED").contains(triggerOn) || !Set.of("ALL", "ANY").contains(matchMode))
                throw new ValidationException("Cấu hình KHI/NẾU không hợp lệ.");
            for (RouterConditionItem condition : conditions) {
                RuleOperators.validate(condition, columnTypes);
            }
            routerPlans.add(RouterPlan.builder()
                    .nodeId(rId)
                    .triggerOn(triggerOn)
                    .matchMode(matchMode)
                    .conditions(conditions)
                    .actionNodeIds(actionTargets)
                    .build());
        }

        List<ActionPlan> actionPlans = new ArrayList<>();
        List<String> conflictActionIds = new ArrayList<>();
        for (JsonNode tNode : telegramNodes) {
            String tId = tNode.path("id").asText("");
            boolean receivingConflict = hasEdge(edges, diffId, "conflict", tId, "in");
            boolean receivingRouter = routerPlans.stream().anyMatch(rp -> rp.getActionNodeIds().contains(tId));
            if (!receivingConflict && !receivingRouter) {
                throw new ValidationException("Khối Telegram cần ít nhất một dây vào.");
            }
            String tChatId = tNode.path("data").path("chatId").asText("").trim();
            if (tChatId.isBlank()) {
                throw new ValidationException("Điền Telegram Chat ID.");
            }
            if (receivingConflict) {
                conflictActionIds.add(tId);
            }
            for (JsonNode edge : edges) {
                if (tId.equals(edge.path("target").asText(""))) {
                    String sId = edge.path("source").asText("");
                    String sPort = edge.path("sourceHandle").asText("");
                    String tPort = edge.path("targetHandle").asText("");
                    boolean isFromDiff = diffId.equals(sId) && "conflict".equals(sPort) && "in".equals(tPort);
                    boolean isFromRouter = routerNodes.stream().anyMatch(rn -> rn.path("id").asText("").equals(sId)) && "out".equals(sPort) && "in".equals(tPort);
                    if (!isFromDiff && !isFromRouter) {
                        throw new ValidationException("Có dây nối không được hỗ trợ trong luồng.");
                    }
                }
            }
            actionPlans.add(ActionPlan.builder()
                    .nodeId(tId)
                    .channel("TELEGRAM")
                    .chatId(tChatId)
                    .recordTemplate(tNode.path("data").hasNonNull("recordTemplate") ? tNode.path("data").path("recordTemplate").asText() : null)
                    .conflictTemplate(tNode.path("data").hasNonNull("conflictTemplate") ? tNode.path("data").path("conflictTemplate").asText() : null)
                    .build());
        }

        boolean notifyConflicts = !conflictActionIds.isEmpty();
        String chatId = actionPlans.isEmpty()
                ? (telegramNodes.isEmpty() ? null : telegramNodes.get(0).path("data").path("chatId").asText("").trim())
                : actionPlans.get(0).getChatId();
        if (chatId != null && chatId.isBlank()) chatId = null;

        for (JsonNode edge : edges) {
            JsonNode source = null;
            for (JsonNode node : nodes) if (node.path("id").asText().equals(edge.path("source").asText())) source = node;
            String from = edge.path("source").asText();
            String to = edge.path("target").asText();
            String port = edge.path("sourceHandle").asText();
            String targetPort = edge.path("targetHandle").asText();
            boolean isRouter = routerNodes.stream().anyMatch(r -> r.path("id").asText().equals(to));
            boolean isTelegram = telegramNodes.stream().anyMatch(t -> t.path("id").asText().equals(to));
            boolean fromRouter = routerNodes.stream().anyMatch(r -> r.path("id").asText().equals(from));

            boolean allowed = source != null && (
                    "scheduleTrigger".equals(source.path("type").asText()) && "out".equals(port) && diffId.equals(to) && "trigger".equals(targetPort)
                    || "in".equals(targetPort) && (
                    "sheetsTrigger".equals(source.path("type").asText()) && "out".equals(port) && diffId.equals(to)
                    || diffId.equals(from) && "clean".equals(port) && (multi
                        ? connectedSheets.stream().anyMatch(sheet -> sheet.getNodeId().equals(to)) || isRouter
                        : (storageNode != null && storageNode.path("id").asText().equals(to)) || isRouter
                          || (sheetWriteNode != null && sheetWriteNode.path("id").asText().equals(to)))
                    || diffId.equals(from) && "conflict".equals(port) && isTelegram
                    || fromRouter && "out".equals(port) && isTelegram));
            if (!allowed) throw new ValidationException("Có dây nối không được hỗ trợ trong luồng.");
        }
        JsonNode timer = findFirstByType(nodes, "scheduleTrigger");
        if (timer != null && !hasEdge(edges, timer.path("id").asText(), "out", diffId, "trigger"))
            throw new ValidationException("Nối khối hẹn giờ vào cổng kích hoạt.");

        if (!columnTypes.isEmpty()) connectedSheets.forEach(endpoint -> endpoint.setColumnTypes(columnTypes));
        String resolvedFlowId = computeFlowId(connectedSheets, idColumn, storageName, syncColumns);
        Map<String, List<String>> executionNodes = new LinkedHashMap<>(transformNodes);
        executionNodes.put("sheets", connectedSheets.stream().map(SheetEndpointRequest::getNodeId).toList());
        executionNodes.put("diff", List.of(diffId));
        if (storageNode != null) executionNodes.put("storage", List.of(storageNode.path("id").asText()));
        if (sheetWriteTargetPlan != null) executionNodes.put("sheetWrite", List.of(sheetWriteTargetPlan.getNodeId()));
        if (!conflictActionIds.isEmpty()) executionNodes.put("telegram", conflictActionIds);
        for (RouterPlan rp : routerPlans) {
            executionNodes.put("router:" + rp.getNodeId(), List.of(rp.getNodeId()));
        }
        for (ActionPlan ap : actionPlans) {
            executionNodes.put("action:" + ap.getNodeId(), List.of(ap.getNodeId()));
        }
        if (timer != null) executionNodes.put("trigger", List.of(timer.path("id").asText()));

        RunSyncRequest request = RunSyncRequest.builder()
                .flowId(resolvedFlowId)
                .accessToken(accessToken)
                .executionNodes(executionNodes)
                .spreadsheetId(connectedSheets.get(0).getSpreadsheetId())
                .sheetName(connectedSheets.get(0).getSheetName())
                .transforms(connectedSheets.get(0).getTransforms())
                .writeBackCleanData(connectedSheets.get(0).isWriteBackCleanData())
                .sheets(connectedSheets.size() >= 2 ? connectedSheets : null)
                .idColumn(idColumn)
                .columnTypes(columnTypes.isEmpty() ? null : columnTypes)
                .syncColumns(syncColumns)
                .storageName(storageName)
                .conflictPolicy(conflictPolicy)
                .notifyConflicts(notifyConflicts)
                .chatId(chatId)
                .routers(routerPlans.isEmpty() ? null : routerPlans)
                .actions(actionPlans.isEmpty() ? null : actionPlans)
                .conflictActionIds(conflictActionIds.isEmpty() ? null : conflictActionIds)
                .sheetWriteTargetPlan(sheetWriteTargetPlan)
                .build();
        return Optional.of(request);
    }

    public Instant computeNextRun(String scheduleType, int intervalMinutes, String dailyTime, String timezone, Instant fromTime) {
        if ("daily".equalsIgnoreCase(scheduleType)) {
            ZoneId zone = ZoneId.of(timezone);
            ZonedDateTime candidate = fromTime.atZone(zone).toLocalDate().atTime(LocalTime.parse(dailyTime, TIME_FORMATTER)).atZone(zone);
            if (!candidate.toInstant().isAfter(fromTime)) candidate = candidate.plusDays(1);
            return candidate.toInstant();
        }
        return fromTime.plusSeconds(Math.multiplyExact(60L, intervalMinutes));
    }

    private List<ColumnTransformConfig> readTransforms(JsonNode configs) {
        if (configs.isMissingNode() || configs.isNull()) return null;
        if (!configs.isArray()) throw new ValidationException("Cấu hình chuẩn hóa không hợp lệ.");
        List<ColumnTransformConfig> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode config : configs) {
            String column = config.path("columnName").asText();
            if (column.isBlank() || !seen.add(column) || !config.path("rules").isArray())
                throw new ValidationException("Cột chuẩn hóa không hợp lệ.");
            List<String> rules = new ArrayList<>();
            for (JsonNode rule : config.path("rules")) {
                if (!Set.of("TRIM", "UPPERCASE", "LOWERCASE", "CAPITALIZE", "PHONE_VN", "DEFAULT_IF_EMPTY").contains(rule.asText()))
                    throw new ValidationException("Quy tắc chuẩn hóa không hợp lệ.");
                rules.add(rule.asText());
            }
            result.add(new ColumnTransformConfig(column, rules, config.path("defaultValue").asText("")));
        }
        return result;
    }

    private JsonNode normalizeTransforms(JsonNode definition) {
        JsonNode copy = definition.deepCopy();
        JsonNode nodes = copy.path("nodes"), edges = copy.path("edges");
        if (!nodes.isArray() || !edges.isArray()) return copy;
        Set<String> allIds = new LinkedHashSet<>();
        for (JsonNode node : nodes) if (node.path("id").asText().isBlank() || !allIds.add(node.path("id").asText()))
            throw new ValidationException("Mã khối không hợp lệ hoặc bị trùng.");
        Set<String> bound = new LinkedHashSet<>();
        Set<String> removed = new LinkedHashSet<>();
        List<ObjectNode> links = new ArrayList<>();
        for (JsonNode transform : nodes) {
            if (!"dataTransform".equals(transform.path("type").asText())) continue;
            String id = transform.path("id").asText();
            List<JsonNode> incoming = new ArrayList<>(), outgoing = new ArrayList<>();
            for (JsonNode edge : edges) {
                if (id.equals(edge.path("target").asText())) incoming.add(edge);
                if (id.equals(edge.path("source").asText())) outgoing.add(edge);
            }
            if (incoming.isEmpty() || outgoing.size() != 1)
                throw new ValidationException("Nối một hoặc nhiều Sheet → Chuẩn hóa → So khớp.");
            String targetId = outgoing.getFirst().path("target").asText();
            JsonNode target = null;
            for (JsonNode node : nodes) if (targetId.equals(node.path("id").asText())) target = node;
            if (target == null || !"diffEngine".equals(target.path("type").asText()) || !hasEdge(edges, id, "out", targetId, "in"))
                throw new ValidationException("Khối Chuẩn hóa cần nối ra đúng một khối So khớp.");
            JsonNode config = transform.path("data");
            readTransforms(config.path("transforms"));
            for (JsonNode input : incoming) {
                String sourceId = input.path("source").asText();
                JsonNode source = null;
                for (JsonNode node : nodes) if (sourceId.equals(node.path("id").asText())) source = node;
                if (source == null || !"sheetsTrigger".equals(source.path("type").asText()) || !bound.add(sourceId)
                        || !"out".equals(input.path("sourceHandle").asText()) || !"in".equals(input.path("targetHandle").asText())
                        || isSheetConnected(edges, sourceId, targetId))
                    throw new ValidationException("Đường nối chuẩn hóa không hợp lệ; không nối trùng, song song hoặc nối chuỗi.");
                ObjectNode data = (ObjectNode) source.path("data");
                data.set("transforms", config.path("transforms").isMissingNode() ? new ObjectMapper().createArrayNode() : config.path("transforms"));
                data.put("writeBackCleanData", config.path("writeBackBySource").path(sourceId).asBoolean(config.path("writeBackCleanData").asBoolean(false)));
                ObjectNode link = new ObjectMapper().createObjectNode();
                link.put("source", sourceId).put("target", targetId).put("sourceHandle", "out").put("targetHandle", "in");
                links.add(link);
            }
            removed.add(id);
        }
        ArrayNode normalizedNodes = new ObjectMapper().createArrayNode();
        for (JsonNode node : nodes) if (!removed.contains(node.path("id").asText())) normalizedNodes.add(node);
        ArrayNode normalizedEdges = new ObjectMapper().createArrayNode();
        for (JsonNode edge : edges) if (!removed.contains(edge.path("source").asText()) && !removed.contains(edge.path("target").asText())) normalizedEdges.add(edge);
        links.forEach(normalizedEdges::add);
        ((ObjectNode) copy).set("nodes", normalizedNodes);
        ((ObjectNode) copy).set("edges", normalizedEdges);
        return copy;
    }

    private int count(JsonNode nodes, String type) {
        int count = 0;
        for (JsonNode node : nodes) if (type.equals(node.path("type").asText())) count++;
        return count;
    }

    private String computeFlowId(List<SheetEndpointRequest> sheets, String key, String storage, Set<String> columns) {
        List<Object> identity = new ArrayList<>();
        if (sheets.size() >= 2) {
            identity.add(sheets.stream().map(sheet -> List.of(sheet.getSpreadsheetId(), sheet.getSheetName())).toList());
            identity.add(key);
            identity.add(columns.stream().sorted().toList());
        } else {
            identity.addAll(List.of(sheets.get(0).getSpreadsheetId(), sheets.get(0).getSheetName(), key, storage));
            if (!columns.isEmpty()) identity.add(columns.stream().sorted().toList());
        }
        if (sheets.stream().anyMatch(s -> s.getTransforms() != null && !s.getTransforms().isEmpty() || s.isWriteBackCleanData())) {
            identity.add(sheets.stream().map(s -> List.of(
                    s.getTransforms() == null ? List.of() : s.getTransforms().stream()
                        .map(c -> List.of(c.getColumnName(), c.getRules(), c.getDefaultValue() == null ? "" : c.getDefaultValue())).toList(),
                    s.isWriteBackCleanData())).toList());
        }
        Map<String, String> columnTypes = sheets.get(0).getColumnTypes();
        if (columnTypes != null && !columnTypes.isEmpty()) identity.add(List.of("columnTypes", new TreeMap<>(columnTypes).entrySet().stream()
                .map(entry -> List.of(entry.getKey(), entry.getValue())).toList()));
        try {
            byte[] bytes = new ObjectMapper().writeValueAsBytes(identity);
            return "flow-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) { throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Không thể xác định mã luồng."); }
    }

    private JsonNode findFirstByType(JsonNode nodes, String type) {
        for (JsonNode node : nodes) {
            if (type.equals(node.path("type").asText(""))) {
                return node;
            }
        }
        return null;
    }

    private boolean isSheetConnected(JsonNode edges, String sheetId, String diffId) {
        return hasEdge(edges, sheetId, "out", diffId, "in") || hasEdge(edges, diffId, "clean", sheetId, "in");
    }

    private boolean hasEdge(JsonNode edges, String source, String sourceHandle, String target, String targetHandle) {
        for (JsonNode edge : edges) {
            if (source.equals(edge.path("source").asText(""))
                    && sourceHandle.equals(edge.path("sourceHandle").asText(""))
                    && target.equals(edge.path("target").asText(""))
                    && targetHandle.equals(edge.path("targetHandle").asText(""))) {
                return true;
            }
        }
        return false;
    }
}
