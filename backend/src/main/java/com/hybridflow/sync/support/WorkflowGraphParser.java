package com.hybridflow.sync.support;

import java.time.LocalTime;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.model.ParsedSchedule;
import org.springframework.stereotype.Component;

@Component
public class WorkflowGraphParser {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(java.time.format.ResolverStyle.STRICT);

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
        if (count(nodes, "scheduleTrigger") > 1) throw new IllegalArgumentException("Chỉ hỗ trợ một khối hẹn giờ trong mỗi luồng.");

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
        if (!Set.of("interval", "daily").contains(type)) throw new IllegalArgumentException("Kiểu lịch không hợp lệ.");
        if (intervalMinutes < 1 || intervalMinutes > 1440 || !data.path("scheduleIntervalMinutes").isMissingNode()
                && !data.path("scheduleIntervalMinutes").isIntegralNumber())
            throw new IllegalArgumentException("Chu kỳ phải là số nguyên từ 1 đến 1440 phút.");
        try { ZoneId.of(timezone); LocalTime.parse(dailyTime, TIME_FORMATTER); }
        catch (Exception exception) { throw new IllegalArgumentException("Giờ chạy hoặc múi giờ không hợp lệ."); }

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

        java.util.Map<String, List<String>> transformNodes = new java.util.LinkedHashMap<>();
        for (JsonNode node : definition.path("nodes")) if ("dataTransform".equals(node.path("type").asText())) {
            String transformId = node.path("id").asText();
            transformNodes.put("transforms", java.util.stream.Stream.concat(transformNodes.getOrDefault("transforms", List.of()).stream(), java.util.stream.Stream.of(transformId)).toList());
            for (JsonNode edge : definition.path("edges")) if (transformId.equals(edge.path("target").asText()))
                transformNodes.put("transform:" + edge.path("source").asText(), List.of(transformId, edge.path("source").asText()));
        }
        definition = normalizeTransforms(definition);
        JsonNode nodes = definition.path("nodes");
        JsonNode edges = definition.path("edges");
        if (!nodes.isArray() || !edges.isArray()) throw new IllegalArgumentException("Cấu hình luồng không hợp lệ.");
        Set<String> supported = Set.of("sheetsTrigger", "scheduleTrigger", "diffEngine", "storageAction", "telegramAction");
        Set<String> ids = new LinkedHashSet<>();
        for (JsonNode node : nodes) {
            if (!supported.contains(node.path("type").asText()) || node.path("id").asText().isBlank()
                    || !ids.add(node.path("id").asText())) throw new IllegalArgumentException("Luồng có khối không hợp lệ hoặc chưa hỗ trợ.");
        }
        if (count(nodes, "diffEngine") != 1 || count(nodes, "telegramAction") > 1 || count(nodes, "scheduleTrigger") > 1)
            throw new IllegalArgumentException("Luồng cần một khối So khớp, tối đa một Telegram và một hẹn giờ.");
        JsonNode diffNode = findFirstByType(nodes, "diffEngine");

        if (diffNode == null) {
            return Optional.empty();
        }

        String diffId = diffNode.path("id").asText("");
        JsonNode diffData = diffNode.path("data");
        String idColumn = diffData.path("uniqueKey").asText("").trim();
        String conflictPolicy = diffData.path("conflictPolicy").asText("");
        if (idColumn.isBlank() || !Set.of("ASK_TELEGRAM", "SOURCE_WINS", "DESTINATION_WINS").contains(conflictPolicy))
            throw new IllegalArgumentException("Cột khóa hoặc chính sách xung đột không hợp lệ.");

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
                throw new IllegalArgumentException("Hãy nối tất cả khối Sheet vào So khớp.");
            }
            JsonNode sheetData = node.path("data");
            String spreadsheetId = sheetData.path("spreadsheetId").asText("").trim();
            String sheetName = sheetData.path("sheetName").asText("").trim();
            if (spreadsheetId.isEmpty() || sheetName.isEmpty()) {
                throw new IllegalArgumentException("Điền đủ file và tên trang tính.");
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
            throw new IllegalArgumentException("Luồng cần nguồn Google Sheet.");
        }

        JsonNode storageNode = findFirstByType(nodes, "storageAction");
        String storageName = "vault";
        if (storageNode != null) {
            storageName = storageNode.path("data").path("tableName").asText("").trim();
        }
        boolean multi = connectedSheets.size() >= 2;
        if (!diffData.path("sharedColumns").asText("").isBlank() && syncColumns.isEmpty())
            throw new IllegalArgumentException("Chọn ít nhất một cột dữ liệu ngoài cột khóa.");
        Set<String> endpoints = new LinkedHashSet<>();
        for (SheetEndpointRequest sheet : connectedSheets) {
            if (!endpoints.add(sheet.getSpreadsheetId() + "\n" + sheet.getSheetName()))
                throw new IllegalArgumentException("Không được nối hai khối vào cùng file và trang tính.");
        }
        if (multi && (storageNode != null || syncColumns.isEmpty()))
            throw new IllegalArgumentException("Luồng nhiều Sheet cần chọn cột chia sẻ và không có khối Kho.");
        if (!multi && (count(nodes, "storageAction") != 1 || storageName.isBlank()
                || !hasEdge(edges, connectedSheets.get(0).getNodeId(), "out", diffId, "in")
                || !hasEdge(edges, diffId, "clean", storageNode.path("id").asText(), "in")))
            throw new IllegalArgumentException("Nối Google Sheet → So khớp → Kho lưu trữ trước khi chạy.");
        if (multi) storageName = "multi_sheet";

        JsonNode telegramNode = findFirstByType(nodes, "telegramAction");
        boolean notifyConflicts = false;
        String chatId = null;

        if (telegramNode != null) {
            String telegramId = telegramNode.path("id").asText("");
            notifyConflicts = hasEdge(edges, diffId, "conflict", telegramId, "in");
            chatId = telegramNode.path("data").path("chatId").asText("").trim();
        }
        if (notifyConflicts && chatId.isBlank()) throw new IllegalArgumentException("Điền Telegram Chat ID.");
        for (JsonNode edge : edges) {
            JsonNode source = null;
            for (JsonNode node : nodes) if (node.path("id").asText().equals(edge.path("source").asText())) source = node;
            String from = edge.path("source").asText();
            String to = edge.path("target").asText();
            String port = edge.path("sourceHandle").asText();
            String targetPort = edge.path("targetHandle").asText();
            boolean allowed = source != null && (
                    "scheduleTrigger".equals(source.path("type").asText()) && "out".equals(port) && diffId.equals(to) && "trigger".equals(targetPort)
                    || "in".equals(targetPort) && (
                    "sheetsTrigger".equals(source.path("type").asText()) && "out".equals(port) && diffId.equals(to)
                    || diffId.equals(from) && "clean".equals(port) && (multi
                        ? connectedSheets.stream().anyMatch(sheet -> sheet.getNodeId().equals(to)) : storageNode.path("id").asText().equals(to))
                    || diffId.equals(from) && "conflict".equals(port) && telegramNode != null && telegramNode.path("id").asText().equals(to)));
            if (!allowed) throw new IllegalArgumentException("Có dây nối không được hỗ trợ trong luồng.");
        }
        JsonNode timer = findFirstByType(nodes, "scheduleTrigger");
        if (timer != null && !hasEdge(edges, timer.path("id").asText(), "out", diffId, "trigger"))
            throw new IllegalArgumentException("Nối khối hẹn giờ vào cổng kích hoạt.");

        String resolvedFlowId = computeFlowId(connectedSheets, idColumn, storageName, syncColumns);
        java.util.Map<String, List<String>> executionNodes = new java.util.LinkedHashMap<>(transformNodes);
        executionNodes.put("sheets", connectedSheets.stream().map(SheetEndpointRequest::getNodeId).toList());
        executionNodes.put("diff", List.of(diffId));
        if (storageNode != null) executionNodes.put("storage", List.of(storageNode.path("id").asText()));
        if (telegramNode != null && notifyConflicts) executionNodes.put("telegram", List.of(telegramNode.path("id").asText()));
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
                .syncColumns(syncColumns)
                .storageName(storageName)
                .conflictPolicy(conflictPolicy)
                .notifyConflicts(notifyConflicts)
                .chatId(chatId)
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

    private List<com.hybridflow.sync.dto.request.ColumnTransformConfig> readTransforms(JsonNode configs) {
        if (configs.isMissingNode() || configs.isNull()) return null;
        if (!configs.isArray()) throw new IllegalArgumentException("Cấu hình chuẩn hóa không hợp lệ.");
        List<com.hybridflow.sync.dto.request.ColumnTransformConfig> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode config : configs) {
            String column = config.path("columnName").asText();
            if (column.isBlank() || !seen.add(column) || !config.path("rules").isArray())
                throw new IllegalArgumentException("Cột chuẩn hóa không hợp lệ.");
            List<String> rules = new ArrayList<>();
            for (JsonNode rule : config.path("rules")) {
                if (!Set.of("TRIM", "UPPERCASE", "LOWERCASE", "CAPITALIZE", "PHONE_VN", "DEFAULT_IF_EMPTY").contains(rule.asText()))
                    throw new IllegalArgumentException("Quy tắc chuẩn hóa không hợp lệ.");
                rules.add(rule.asText());
            }
            result.add(new com.hybridflow.sync.dto.request.ColumnTransformConfig(column, rules, config.path("defaultValue").asText("")));
        }
        return result;
    }

    private JsonNode normalizeTransforms(JsonNode definition) {
        JsonNode copy = definition.deepCopy();
        JsonNode nodes = copy.path("nodes"), edges = copy.path("edges");
        if (!nodes.isArray() || !edges.isArray()) return copy;
        Set<String> allIds = new LinkedHashSet<>();
        for (JsonNode node : nodes) if (node.path("id").asText().isBlank() || !allIds.add(node.path("id").asText()))
            throw new IllegalArgumentException("Mã khối không hợp lệ hoặc bị trùng.");
        Set<String> bound = new LinkedHashSet<>();
        Set<String> removed = new LinkedHashSet<>();
        List<com.fasterxml.jackson.databind.node.ObjectNode> links = new ArrayList<>();
        for (JsonNode transform : nodes) {
            if (!"dataTransform".equals(transform.path("type").asText())) continue;
            String id = transform.path("id").asText();
            List<JsonNode> incoming = new ArrayList<>(), outgoing = new ArrayList<>();
            for (JsonNode edge : edges) {
                if (id.equals(edge.path("target").asText())) incoming.add(edge);
                if (id.equals(edge.path("source").asText())) outgoing.add(edge);
            }
            if (incoming.isEmpty() || outgoing.size() != 1)
                throw new IllegalArgumentException("Nối một hoặc nhiều Sheet → Chuẩn hóa → So khớp.");
            String targetId = outgoing.getFirst().path("target").asText();
            JsonNode target = null;
            for (JsonNode node : nodes) if (targetId.equals(node.path("id").asText())) target = node;
            if (target == null || !"diffEngine".equals(target.path("type").asText()) || !hasEdge(edges, id, "out", targetId, "in"))
                throw new IllegalArgumentException("Khối Chuẩn hóa cần nối ra đúng một khối So khớp.");
            JsonNode config = transform.path("data");
            readTransforms(config.path("transforms"));
            for (JsonNode input : incoming) {
                String sourceId = input.path("source").asText();
                JsonNode source = null;
                for (JsonNode node : nodes) if (sourceId.equals(node.path("id").asText())) source = node;
                if (source == null || !"sheetsTrigger".equals(source.path("type").asText()) || !bound.add(sourceId)
                        || !"out".equals(input.path("sourceHandle").asText()) || !"in".equals(input.path("targetHandle").asText())
                        || isSheetConnected(edges, sourceId, targetId))
                    throw new IllegalArgumentException("Đường nối chuẩn hóa không hợp lệ; không nối trùng, song song hoặc nối chuỗi.");
                com.fasterxml.jackson.databind.node.ObjectNode data = (com.fasterxml.jackson.databind.node.ObjectNode) source.path("data");
                data.set("transforms", config.path("transforms").isMissingNode() ? new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode() : config.path("transforms"));
                data.put("writeBackCleanData", config.path("writeBackBySource").path(sourceId).asBoolean(config.path("writeBackCleanData").asBoolean(false)));
                com.fasterxml.jackson.databind.node.ObjectNode link = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
                link.put("source", sourceId).put("target", targetId).put("sourceHandle", "out").put("targetHandle", "in");
                links.add(link);
            }
            removed.add(id);
        }
        com.fasterxml.jackson.databind.node.ArrayNode normalizedNodes = new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode();
        for (JsonNode node : nodes) if (!removed.contains(node.path("id").asText())) normalizedNodes.add(node);
        com.fasterxml.jackson.databind.node.ArrayNode normalizedEdges = new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode();
        for (JsonNode edge : edges) if (!removed.contains(edge.path("source").asText()) && !removed.contains(edge.path("target").asText())) normalizedEdges.add(edge);
        links.forEach(normalizedEdges::add);
        ((com.fasterxml.jackson.databind.node.ObjectNode) copy).set("nodes", normalizedNodes);
        ((com.fasterxml.jackson.databind.node.ObjectNode) copy).set("edges", normalizedEdges);
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
        try {
            byte[] bytes = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsBytes(identity);
            return "flow-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) { throw new IllegalStateException("Không thể xác định mã luồng."); }
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
