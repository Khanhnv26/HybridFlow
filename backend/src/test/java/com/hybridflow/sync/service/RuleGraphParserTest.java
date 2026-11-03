package com.hybridflow.sync.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.support.WorkflowGraphParser;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RuleGraphParserTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final WorkflowGraphParser parser = new WorkflowGraphParser();

    private JsonNode graph(String operator, String value, String type) throws Exception {
        return mapper.readTree("""
                {"nodes":[
                  {"id":"s","type":"sheetsTrigger","data":{"spreadsheetId":"sheet","sheetName":"Data"}},
                  {"id":"d","type":"diffEngine","data":{"uniqueKey":"id","sharedColumns":"quantity","conflictPolicy":"ASK_TELEGRAM","columnTypes":{"quantity":"%s"}}},
                  {"id":"v","type":"storageAction","data":{"tableName":"vault"}},
                  {"id":"r","type":"routerCondition","data":{"routerConditions":[{"columnName":"quantity","operator":"%s","value":%s}]}},
                  {"id":"t","type":"telegramAction","data":{"chatId":"123"}}],
                 "edges":[
                  {"source":"s","sourceHandle":"out","target":"d","targetHandle":"in"},
                  {"source":"d","sourceHandle":"clean","target":"v","targetHandle":"in"},
                  {"source":"d","sourceHandle":"clean","target":"r","targetHandle":"in"},
                  {"source":"r","sourceHandle":"out","target":"t","targetHandle":"in"}]}
                """.formatted(type, operator, mapper.writeValueAsString(value)));
    }

    @Test
    void numericRulesValidateInSavedGraphsAndKeepTheExistingOutput() throws Exception {
        RunSyncRequest request = parser.buildSyncRequest("editor", graph("LESS_THAN", "10", "NUMBER"), "token").orElseThrow();
        assertEquals("LESS_THAN", request.getRouters().getFirst().getConditions().getFirst().getOperator());
        assertEquals("t", request.getRouters().getFirst().getActionNodeIds().getFirst());
        assertThrows(IllegalArgumentException.class, () -> parser.buildSyncRequest("editor", graph("LESS_THAN", "10", "TEXT"), "token"));
        assertThrows(IllegalArgumentException.class, () -> parser.buildSyncRequest("editor", graph("LESS_THAN", "", "NUMBER"), "token"));
        assertEquals("COLUMN_CHANGED", parser.buildSyncRequest("editor", graph("COLUMN_CHANGED", null, "TEXT"), "token")
                .orElseThrow().getRouters().getFirst().getConditions().getFirst().getOperator());
    }
}
