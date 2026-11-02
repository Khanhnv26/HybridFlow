package com.hybridflow.sync;

import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.service.TelegramNotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Opt-in: run only against a disposable PostgreSQL database, never a developer database. */
@EnabledIfEnvironmentVariable(named = "HYBRIDFLOW_TEST_DB_URL", matches = "jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
@SpringBootTest(properties = {
        "spring.datasource.url=${HYBRIDFLOW_TEST_DB_URL}", "spring.datasource.username=hybridflow_test",
        "spring.datasource.password=hybridflow_test", "spring.jpa.show-sql=false",
        "logging.level.com.hybridflow=WARN", "logging.level.org.hibernate=WARN" })
@AutoConfigureMockMvc
class SyncApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @MockBean GoogleSheetsService sheets;
    @MockBean GoogleOAuthService oauth;
    @MockBean TelegramNotificationService telegram;

    @BeforeEach void cleanDatabase() {
        jdbc.execute("TRUNCATE sheet_write_journal,sync_conflicts,sync_snapshots,vault_records,sync_flow_bindings,sync_executions,workflow_definitions RESTART IDENTITY");
        source("NEW");
    }
    private void source(String status) {
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().spreadsheetId("sheet")
                .sheetName("Data").headers(List.of("id", "status"))
                .rows(List.of(Map.of("id", "1", "status", status))).totalRows(1).build());
    }
    private String request(String flow) {
        return """
                {"flowId":"%s","accessToken":"test-token","spreadsheetId":"sheet","sheetName":"Data",
                "idColumn":"id","storageName":"vault","bootstrapConfirmed":true,"notifyConflicts":false,
                "conflictPolicy":"ASK_TELEGRAM"}
                """.formatted(flow);
    }
    private void run(String flow) throws Exception {
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(request(flow)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.bootstrapRequired").value(false));
    }
    private String statusOf(String table, String flow) {
        return jdbc.queryForObject("SELECT data->>'status' FROM " + table + " WHERE flow_id=? AND record_id='1'", String.class, flow);
    }

    @Test void apiRoundTripPersistsBothDirectionsAndConflictApproval() throws Exception {
        run("flow-one");
        assertEquals("NEW", statusOf("vault_records", "flow-one"));
        source("SHIPPING"); run("flow-one");
        assertEquals("SHIPPING", statusOf("vault_records", "flow-one"));
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"DELIVERED\"') WHERE flow_id='flow-one'");
        run("flow-one");
        verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "DELIVERED"));
        assertEquals("DELIVERED", statusOf("sync_snapshots", "flow-one"));
        source("PROCESSING");
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"CANCELLED\"') WHERE flow_id='flow-one'");
        run("flow-one");
        mvc.perform(get("/api/v1/conflicts").param("flowId", "flow-one"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].recordId").value("1"));
        Long id = jdbc.queryForObject("SELECT id FROM sync_conflicts WHERE status='OPEN'", Long.class);
        mvc.perform(post("/api/v1/conflicts/" + id + "/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"resolvedValue\":\"CANCELLED\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RESOLVED"));
        assertEquals("CANCELLED", statusOf("vault_records", "flow-one"));
        assertEquals("CANCELLED", statusOf("sync_snapshots", "flow-one"));
        mvc.perform(get("/api/v1/workflows/flow-one/history")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4));
        verifyNoInteractions(telegram);
    }

    @Test void failedProviderWriteRollsBackDataButKeepsErrorHistory() throws Exception {
        run("flow-one");
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"CANCELLED\"') WHERE flow_id='flow-one'");
        doThrow(new IllegalStateException("Provider unavailable")).when(sheets).updateCells(anyString(), anyString(), anyMap());
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(request("flow-one")))
                .andExpect(status().isInternalServerError());
        assertEquals("NEW", statusOf("sync_snapshots", "flow-one"));
        assertEquals("CANCELLED", statusOf("vault_records", "flow-one"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM sync_executions WHERE status='ERROR'", Integer.class));
    }

    @Test void resolvedConflictsDisappearAndDoNotSendAnotherTelegramAlert() throws Exception {
        run("flow-one");
        source("SHIPPING");
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"CANCELLED\"') WHERE flow_id='flow-one'");
        when(telegram.sendConflictAlert(any(), eq("123"))).thenReturn(true);
        String notifyingRequest = request("flow-one").replace("\"notifyConflicts\":false", "\"notifyConflicts\":true,\"chatId\":\"123\"");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(notifyingRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsSent").value(1));
        Long id = jdbc.queryForObject("SELECT id FROM sync_conflicts WHERE status='OPEN'", Long.class);
        mvc.perform(post("/api/v1/conflicts/" + id + "/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"resolvedValue\":\"CANCELLED\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/conflicts").param("flowId", "flow-one"))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(post("/api/v1/conflicts/" + id + "/notify").contentType(MediaType.APPLICATION_JSON)
                .content("{\"chatId\":\"123\"}"))
                .andExpect(status().isBadRequest());
        // The next read reflects the value that the successful resolution wrote to Google Sheets.
        source("CANCELLED");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(notifyingRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.conflicts.length()").value(0))
                .andExpect(jsonPath("$.notificationsSent").value(0));
        verify(telegram, times(1)).sendConflictAlert(any(), eq("123"));
    }

    @Test void flowBindingsRejectRepointingAndIsolateIdenticalRecordIds() throws Exception {
        run("flow-one");
        source("SECOND"); run("flow-two");
        assertEquals("NEW", statusOf("vault_records", "flow-one"));
        assertEquals("SECOND", statusOf("vault_records", "flow-two"));
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON)
                .content(request("flow-one").replace("\"spreadsheetId\":\"sheet\"", "\"spreadsheetId\":\"different-sheet\"")))
                .andExpect(status().isBadRequest());
        assertEquals("NEW", statusOf("vault_records", "flow-one"));
        mvc.perform(get("/api/v1/conflicts").param("flowId", "flow-two"))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test void workflowDefinitionPersistsAcrossApiRequests() throws Exception {
        String definition = "{\"nodes\":[{\"id\":\"source\",\"data\":{\"spreadsheetId\":\"sheet\"}}],\"edges\":[]}";
        mvc.perform(put("/api/v1/workflows/editor-id/definition").contentType(MediaType.APPLICATION_JSON).content(definition))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/workflows/editor-id/definition"))
                .andExpect(status().isOk()).andExpect(content().json(definition));
    }
    private String multiRequest() {
        return """
                {"flowId":"multi","accessToken":"test-token","idColumn":"id","syncColumns":["status"],
                "bootstrapConfirmed":true,"sheets":[
                {"spreadsheetId":"a","sheetName":"Data","label":"Same"},
                {"spreadsheetId":"b","sheetName":"Data","label":"Same"},
                {"spreadsheetId":"c","sheetName":"Data","label":"Same"}]}
                """;
    }
    private Map<String, String> multiSources() {
        Map<String, String> live = new HashMap<>(Map.of("a", "NEW", "b", "NEW", "c", "NEW"));
        when(sheets.readSheet(any())).thenAnswer(inv -> {
            com.hybridflow.connector.google.dto.request.ReadSheetRequest request = inv.getArgument(0);
            return SheetDataResponse.builder().spreadsheetId(request.getSpreadsheetId()).sheetName("Data")
                    .headers(List.of("id", "status")).rows(List.of(Map.of("id", "1", "status", live.get(request.getSpreadsheetId())))).build();
        });
        doAnswer(inv -> {
            Map<String, String> cells = inv.getArgument(2);
            live.put(inv.getArgument(1), cells.get("'Data'!B2"));
            return null;
        }).when(sheets).updateCells(anyString(), anyString(), anyMap());
        return live;
    }
    private void runMulti() throws Exception {
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(multiRequest()))
                .andExpect(status().isOk());
    }
    @Test void threeSheetsRetainIdenticalLabelsAndRejectStaleApproval() throws Exception {
        Map<String, String> live = multiSources();
        runMulti();
        live.put("a", "SOURCE"); live.put("b", "OTHER");
        runMulti();
        Long conflictId = jdbc.queryForObject("SELECT id FROM sync_conflicts WHERE status='OPEN'", Long.class);
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM sync_conflicts, jsonb_object_keys(candidates_json)", Integer.class));
        live.put("c", "LATER_EDIT");
        mvc.perform(post("/api/v1/conflicts/" + conflictId + "/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"resolvedValue\":\"SOURCE\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isBadRequest());
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
        runMulti();
        Long currentId = jdbc.queryForObject("SELECT id FROM sync_conflicts WHERE status='OPEN'", Long.class);
        assertNotEquals(conflictId, currentId);
        mvc.perform(post("/api/v1/conflicts/" + currentId + "/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"resolvedValue\":\"SOURCE\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isOk());
        assertEquals(Map.of("a", "SOURCE", "b", "SOURCE", "c", "SOURCE"), live);
        assertEquals("SOURCE", statusOf("sync_snapshots", "multi"));
        runMulti();
        mvc.perform(get("/api/v1/conflicts").param("flowId", "multi")).andExpect(content().json("[]"));
    }
    @Test void multiSheetFailureRollsBackRemoteWritesAndCheckpointThenCanRetry() throws Exception {
        Map<String, String> live = multiSources();
        runMulti();
        live.put("a", "EDITED");
        java.util.concurrent.atomic.AtomicBoolean failOnce = new java.util.concurrent.atomic.AtomicBoolean(true);
        doAnswer(inv -> {
            Map<String, String> cells = inv.getArgument(2);
            live.put("c", cells.get("'Data'!B2"));
            if (failOnce.getAndSet(false)) throw new IllegalStateException("ambiguous timeout");
            return null;
        }).when(sheets).updateCells(anyString(), eq("c"), anyMap());
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(multiRequest()))
                .andExpect(status().isInternalServerError());
        assertEquals(Map.of("a", "EDITED", "b", "NEW", "c", "NEW"), live);
        assertEquals("NEW", statusOf("sync_snapshots", "multi"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM sheet_write_journal WHERE status='PENDING'", Integer.class));
        runMulti();
        assertEquals(Map.of("a", "EDITED", "b", "EDITED", "c", "EDITED"), live);
        assertEquals("EDITED", statusOf("sync_snapshots", "multi"));
    }
}
