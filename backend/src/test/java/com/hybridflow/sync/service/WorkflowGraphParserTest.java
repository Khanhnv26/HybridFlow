package com.hybridflow.sync.service;

import com.hybridflow.sync.support.WorkflowGraphParser;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class WorkflowGraphParserTest {
    @Test void typedColumnConfigurationMatchesFrontendIdentityAndSurvivesParsing() throws Exception {
        com.fasterxml.jackson.databind.JsonNode graph = new com.fasterxml.jackson.databind.ObjectMapper().readTree("""
                {"nodes":[{"id":"s","type":"sheetsTrigger","data":{"spreadsheetId":"sheet","sheetName":"Data"}},
                {"id":"d","type":"diffEngine","data":{"uniqueKey":"id","sharedColumns":"price","conflictPolicy":"ASK_TELEGRAM","columnTypes":{"price":"NUMBER"}}},
                {"id":"v","type":"storageAction","data":{"tableName":"vault"}}],
                "edges":[{"source":"s","sourceHandle":"out","target":"d","targetHandle":"in"},
                {"source":"d","sourceHandle":"clean","target":"v","targetHandle":"in"}]}
                """);
        com.hybridflow.sync.dto.request.RunSyncRequest request = parser.buildSyncRequest("editor", graph, "token").orElseThrow();
        assertEquals(java.util.Map.of("price", "NUMBER"), request.getColumnTypes());
        assertEquals("flow-f56be653711ec4ae95c3a0f8e1e6a80a37620d79c1b42c67341634dd59af1bcb", request.getFlowId());
    }
    private final WorkflowGraphParser parser = new WorkflowGraphParser();
    @Test void dailyTimeUsesConfiguredZoneInsteadOfJvmZone() {
        assertEquals(Instant.parse("2026-11-04T01:00:00Z"), parser.computeNextRun("daily", 5, "08:00", "Asia/Ho_Chi_Minh", Instant.parse("2026-11-03T02:00:00Z")));
        assertEquals(Instant.parse("2026-11-03T08:00:00Z"), parser.computeNextRun("daily", 5, "08:00", "UTC", Instant.parse("2026-11-03T02:00:00Z")));
    }
    @Test void dailyRunAtBoundaryMovesToTomorrow() {
        assertEquals(Instant.parse("2026-11-04T01:00:00Z"), parser.computeNextRun("daily", 5, "08:00", "Asia/Ho_Chi_Minh", Instant.parse("2026-11-03T01:00:00Z")));
    }

    private com.fasterxml.jackson.databind.node.ObjectNode transformGraph() throws Exception {
        return (com.fasterxml.jackson.databind.node.ObjectNode) new com.fasterxml.jackson.databind.ObjectMapper().readTree("""
            {"nodes":[
              {"id":"source","type":"sheetsTrigger","data":{"spreadsheetId":"sheet-A","sheetName":"Data"}},
              {"id":"second","type":"sheetsTrigger","data":{"spreadsheetId":"sheet-B","sheetName":"Data"}},
              {"id":"diff","type":"diffEngine","data":{"uniqueKey":"sku","sharedColumns":"status","conflictPolicy":"ASK_TELEGRAM"}},
              {"id":"transform","type":"dataTransform","data":{"transforms":[{"columnName":"sku","rules":["TRIM","UPPERCASE"]}],"writeBackCleanData":true}}
            ],"edges":[
              {"source":"source","target":"transform","sourceHandle":"out","targetHandle":"in"},
              {"source":"transform","target":"diff","sourceHandle":"out","targetHandle":"in"},
              {"source":"second","target":"diff","sourceHandle":"out","targetHandle":"in"}
            ]}
            """);
    }
    @Test void scheduledTransformUsesSameIdentityAndSettingsAsFrontend() throws Exception {
        var graph = transformGraph();
        var request = parser.buildSyncRequest("ignored", graph, "token").orElseThrow();
        assertEquals("flow-2e49963d24cbf2beab372defc7aa1e405b80480c7109e4a289a1ab13d9ef9daa", request.getFlowId());
        assertEquals(List.of("TRIM", "UPPERCASE"), request.getSheets().getFirst().getTransforms().getFirst().getRules());
        assertTrue(request.getSheets().getFirst().isWriteBackCleanData());
        assertNull(request.getSheets().get(1).getTransforms());
        assertEquals(4, graph.path("nodes").size());
        ((com.fasterxml.jackson.databind.node.ObjectNode) graph.path("nodes").get(3).path("data")).put("writeBackCleanData", false);
        assertNotEquals(request.getFlowId(), parser.buildSyncRequest("ignored", graph, "token").orElseThrow().getFlowId());
    }
    @Test void scheduledTransformRejectsBypassAndDisconnectedBlocks() throws Exception {
        var graph = transformGraph();
        var edge = ((com.fasterxml.jackson.databind.node.ArrayNode) graph.path("edges")).addObject();
        edge.put("source", "source").put("target", "diff").put("sourceHandle", "out").put("targetHandle", "in");
        assertThrows(IllegalArgumentException.class, () -> parser.buildSyncRequest("ignored", graph, "token"));
        var disconnected = transformGraph();
        ((com.fasterxml.jackson.databind.node.ArrayNode) disconnected.path("edges")).remove(1);
        assertThrows(IllegalArgumentException.class, () -> parser.buildSyncRequest("ignored", disconnected, "token"));
    }

    private com.fasterxml.jackson.databind.node.ObjectNode sharedGraph() throws Exception {
        var graph = transformGraph();
        ((com.fasterxml.jackson.databind.node.ObjectNode) graph.path("edges").get(2)).put("target", "transform");
        var third = ((com.fasterxml.jackson.databind.node.ArrayNode) graph.path("nodes")).addObject();
        third.put("id", "third").put("type", "sheetsTrigger");
        third.putObject("data").put("spreadsheetId", "sheet-C").put("sheetName", "Data");
        ((com.fasterxml.jackson.databind.node.ArrayNode) graph.path("edges")).addObject()
                .put("source", "third").put("target", "transform").put("sourceHandle", "out").put("targetHandle", "in");
        ((com.fasterxml.jackson.databind.node.ObjectNode) graph.path("nodes").get(3).path("data"))
                .putObject("writeBackBySource").put("source", true).put("second", false).put("third", true);
        return graph;
    }
    @Test void sharedTransformDistributesRulesAndWriteBackPerSourceWithFrontendIdentity() throws Exception {
        var request = parser.buildSyncRequest("ignored", sharedGraph(), "token").orElseThrow();
        assertEquals(3, request.getSheets().size());
        assertEquals(List.of(true, false, true), request.getSheets().stream().map(s -> s.isWriteBackCleanData()).toList());
        for (var sheet : request.getSheets()) assertEquals(List.of("TRIM", "UPPERCASE"), sheet.getTransforms().getFirst().getRules());
        assertEquals("flow-3de00f0e45057f912e6f975f793d7e82f1921d90fa09e3094c2e18d359226d54", request.getFlowId());
        assertEquals(List.of("transform", "second"), request.getExecutionNodes().get("transform:second"));
    }
    @Test void sharedTransformRejectsDuplicateSourceEdges() throws Exception {
        var graph = sharedGraph();
        ((com.fasterxml.jackson.databind.node.ArrayNode) graph.path("edges")).add(graph.path("edges").get(2).deepCopy());
        assertThrows(IllegalArgumentException.class, () -> parser.buildSyncRequest("ignored", graph, "token"));
    }

    @Test void routerAndMultipleTelegramActionsParseCorrectly() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var graph = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree("""
            {"nodes":[
              {"id":"s1","type":"sheetsTrigger","data":{"spreadsheetId":"sheet-A","sheetName":"Orders"}},
              {"id":"s2","type":"sheetsTrigger","data":{"spreadsheetId":"sheet-B","sheetName":"Orders"}},
              {"id":"diff","type":"diffEngine","data":{"uniqueKey":"id","sharedColumns":"status,amount","conflictPolicy":"ASK_TELEGRAM"}},
              {"id":"r1","type":"routerCondition","data":{"routerTriggerOn":"UPDATED","routerMatchMode":"ALL","routerConditions":[{"columnName":"status","operator":"CHANGED_TO","value":"Đang giao"}]}},
              {"id":"t1","type":"telegramAction","data":{"chatId":"111111","recordTemplate":"Đơn {id} đang giao"}},
              {"id":"t2","type":"telegramAction","data":{"chatId":"222222","recordTemplate":"Quản lý: đơn {id}"}},
              {"id":"t3","type":"telegramAction","data":{"chatId":"333333"}}
            ],"edges":[
              {"source":"s1","target":"diff","sourceHandle":"out","targetHandle":"in"},
              {"source":"s2","target":"diff","sourceHandle":"out","targetHandle":"in"},
              {"source":"diff","target":"r1","sourceHandle":"clean","targetHandle":"in"},
              {"source":"r1","target":"t1","sourceHandle":"out","targetHandle":"in"},
              {"source":"r1","target":"t2","sourceHandle":"out","targetHandle":"in"},
              {"source":"diff","target":"t3","sourceHandle":"conflict","targetHandle":"in"}
            ]}
            """);

        var request = parser.buildSyncRequest("flow-test", graph, "token").orElseThrow();
        assertNotNull(request.getRouters());
        assertEquals(1, request.getRouters().size());
        assertEquals("r1", request.getRouters().getFirst().getNodeId());
        assertEquals(List.of("t1", "t2"), request.getRouters().getFirst().getActionNodeIds());

        assertNotNull(request.getActions());
        assertEquals(3, request.getActions().size());
        assertEquals(List.of("t3"), request.getConflictActionIds());
        assertTrue(request.isNotifyConflicts());

        assertEquals(List.of("r1"), request.getExecutionNodes().get("router:r1"));
        assertEquals(List.of("t1"), request.getExecutionNodes().get("action:t1"));
        assertEquals(List.of("t2"), request.getExecutionNodes().get("action:t2"));
        assertEquals(List.of("t3"), request.getExecutionNodes().get("action:t3"));
        assertEquals(List.of("t3"), request.getExecutionNodes().get("telegram"));
    }

    @Test void routerCanFeedSheetWriteWithoutTelegramAndWriterRejectsTwoInputs() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var graph = mapper.readTree("""
            {"nodes":[
              {"id":"s","type":"sheetsTrigger","data":{"spreadsheetId":"source","sheetName":"Orders"}},
              {"id":"diff","type":"diffEngine","data":{"uniqueKey":"id","conflictPolicy":"ASK_TELEGRAM"}},
              {"id":"vault","type":"storageAction","data":{"tableName":"vault"}},
              {"id":"route","type":"routerCondition","data":{"routerConditions":[{"columnName":"status","operator":"EQUALS","value":"OK"}]}},
              {"id":"writer","type":"sheetWriteAction","data":{"targetSpreadsheetId":"target","targetSheetName":"Orders","targetKeyColumn":"id",
                "columnMappings":[{"sourceColumn":"status","targetColumn":"status"}]}}
            ],"edges":[
              {"source":"s","target":"diff","sourceHandle":"out","targetHandle":"in"},
              {"source":"diff","target":"vault","sourceHandle":"clean","targetHandle":"in"},
              {"source":"diff","target":"route","sourceHandle":"clean","targetHandle":"in"},
              {"source":"route","target":"writer","sourceHandle":"out","targetHandle":"in"}
            ]}
            """);
        var request = parser.buildSyncRequest("flow-test", graph, "token").orElseThrow();
        assertEquals("writer", request.getRouters().getFirst().getSheetWriteNodeId());
        assertEquals("writer", request.getSheetWriteTargetPlan().getNodeId());
        assertTrue(request.getRouters().getFirst().getActionNodeIds().isEmpty());
        new com.hybridflow.sync.service.impl.RuleEvaluationServiceImpl().validate(
                request.getRouters(), request.getActions(), java.util.Set.of("id", "status"));

        ((com.fasterxml.jackson.databind.node.ArrayNode) graph.path("edges")).addObject()
                .put("source", "diff").put("sourceHandle", "clean").put("target", "writer").put("targetHandle", "in");
        assertThrows(IllegalArgumentException.class, () -> parser.buildSyncRequest("flow-test", graph, "token"));
    }

    @Test void routerValidationRejectsChainingAndOrphanNodes() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        // Chained router r1 -> r2
        var chained = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree("""
            {"nodes":[
              {"id":"s1","type":"sheetsTrigger","data":{"spreadsheetId":"sheet-A","sheetName":"Orders"}},
              {"id":"s2","type":"sheetsTrigger","data":{"spreadsheetId":"sheet-B","sheetName":"Orders"}},
              {"id":"diff","type":"diffEngine","data":{"uniqueKey":"id","sharedColumns":"status","conflictPolicy":"ASK_TELEGRAM"}},
              {"id":"r1","type":"routerCondition","data":{"routerConditions":[{"columnName":"status","operator":"EQUALS","value":"OK"}]}},
              {"id":"r2","type":"routerCondition","data":{"routerConditions":[{"columnName":"status","operator":"EQUALS","value":"OK"}]}},
              {"id":"t1","type":"telegramAction","data":{"chatId":"123"}}
            ],"edges":[
              {"source":"s1","target":"diff","sourceHandle":"out","targetHandle":"in"},
              {"source":"s2","target":"diff","sourceHandle":"out","targetHandle":"in"},
              {"source":"diff","target":"r1","sourceHandle":"clean","targetHandle":"in"},
              {"source":"r1","target":"r2","sourceHandle":"out","targetHandle":"in"},
              {"source":"r2","target":"t1","sourceHandle":"out","targetHandle":"in"}
            ]}
            """);
        assertThrows(IllegalArgumentException.class, () -> parser.buildSyncRequest("flow-test", chained, "token"));
    }
}
