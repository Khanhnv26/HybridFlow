package com.hybridflow.sync.service;

import com.hybridflow.sync.support.WorkflowGraphParser;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class WorkflowGraphParserTest {
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
}
