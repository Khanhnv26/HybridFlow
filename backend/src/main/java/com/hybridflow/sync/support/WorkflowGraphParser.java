package com.hybridflow.sync.support;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.model.ParsedSchedule;
import org.springframework.stereotype.Component;

@Component
public class WorkflowGraphParser {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    public ParsedSchedule extractSchedule(JsonNode definition, LocalDateTime now) {
        if(definition == null) {
            return ParsedSchedule.disable();
        }
        JsonNode nodes = definition.path("nodes");
        JsonNode edges = definition.path("edges");

        if(!nodes.isArray() || !edges.isArray()) {
            return ParsedSchedule.disable();
        }

        JsonNode diffNode = findFirstByType(nodes, "diffEngine");
        JsonNode scheduleNode = findFirstByType(nodes, "scheduleTrigger");

        if(diffNode == null || scheduleNode == null) {
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

            if(scheduleId.equals(source)
                    && "out".equals(sourceHandle)
                    && diffId.equals(target)
                    && "trigger".equals(targetHandle)
            ) {
                wiredToTriggerPort = true;
                break;
            }
        }

        JsonNode data = scheduleNode.path("data");
        boolean enabled = wiredToTriggerPort && data.path("scheduleEnabled").asBoolean(true);
        String type = data.path("scheduleType").asText("interval");
        int intervalMinutes = Math.max(1, data.path("scheduleIntervalMinutes").asInt(5));
        String dailyTime = data.path("scheduleTime").asText("08:00");

        LocalDateTime nextRunAt = enabled ? computeNextRun(type, intervalMinutes, dailyTime, now) : null;

        return ParsedSchedule.builder()
                .enabled(enabled)
                .scheduleType(type)
                .intervalMinutes(intervalMinutes)
                .dailyTime(dailyTime)
                .nextRunAt(nextRunAt)
                .build();
    }

    public Optional<RunSyncRequest> buildSyncRequest(String flowId, JsonNode definition, String accessToken) {

        if(accessToken == null || accessToken.isBlank() || definition == null) {
            return Optional.empty();
        }

        JsonNode nodes = definition.path("nodes");
        JsonNode edges = definition.path("edges");
        JsonNode diffNode = findFirstByType(nodes, "diffEngine");

        if(diffNode == null) {
            return Optional.empty();
        }

        String diffId = diffNode.path("id").asText("");
        JsonNode diffData = diffNode.path("data");
        String idColumn = diffData.path("uniqueKey").asText("id").trim();
        String conflictPolicy = diffData.path("conflictPolicy").asText("AS_TELEGRAM");

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
                continue;
            }
            JsonNode sheetData = node.path("data");
            String spreadsheetId = sheetData.path("spreadsheetId").asText("").trim();
            String sheetName = sheetData.path("sheetName").asText("").trim();
            if (spreadsheetId.isEmpty() || sheetName.isEmpty()) {
                return Optional.empty();
            }
            SheetEndpointRequest endpoint = SheetEndpointRequest.builder()
                    .nodeId(nodeId)
                    .label("Nguồn " + index + " (" + sheetName + ")")
                    .spreadsheetId(spreadsheetId)
                    .spreadsheetTitle(sheetData.path("spreadsheetTitle").asText(null))
                    .sheetName(sheetName)
                    .build();
            connectedSheets.add(endpoint);
            index++;
        }

        if (connectedSheets.isEmpty()) {
            return Optional.empty();
        }

        JsonNode storageNode = findFirstByType(nodes, "storageAction");
        String storageName = "vault";
        if (storageNode != null) {
            storageName = storageNode.path("data").path("tableName").asText("vault").trim();
        }

        JsonNode telegramNode = findFirstByType(nodes, "telegramAction");
        boolean notifyConflicts = false;
        String chatId = null;

        if (telegramNode != null) {
            String telegramId = telegramNode.path("id").asText("");
            notifyConflicts = hasEdge(edges, diffId, "conflict", telegramId, "in");
            chatId = telegramNode.path("data").path("chatId").asText("").trim();
        }

        RunSyncRequest request = RunSyncRequest.builder()
                .flowId(flowId)
                .accessToken(accessToken)
                .spreadsheetId(connectedSheets.get(0).getSpreadsheetId())
                .sheetName(connectedSheets.get(0).getSheetName())
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

    private LocalDateTime computeNextRun(String scheduleType, int intervalMinutes, String dailyTime, LocalDateTime fromTime) {
        if ("daily".equalsIgnoreCase(scheduleType)) {
            LocalTime targetTime;
            try {
                targetTime = LocalTime.parse(dailyTime, TIME_FORMATTER);
            } catch (Exception ignored) {
                targetTime = LocalTime.of(8, 0);
            }
            LocalDateTime candidate = LocalDateTime.of(fromTime.toLocalDate(), targetTime);
            if (!candidate.isAfter(fromTime)) {
                candidate = candidate.plusDays(1);
            }
            return candidate;
        }
        return fromTime.plusMinutes(Math.max(1, intervalMinutes));
    }

    private JsonNode findFirstByType(JsonNode nodes, String type) {
        for(JsonNode node : nodes) {
            if(type.equals(node.path("type").asText(""))) {
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
