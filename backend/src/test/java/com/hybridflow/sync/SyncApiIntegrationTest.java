package com.hybridflow.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.service.NotificationOutboxService;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.WorkflowJobService;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Opt-in: run only against a disposable PostgreSQL database, never a developer database. */
@EnabledIfEnvironmentVariable(named = "HYBRIDFLOW_TEST_DB_URL", matches = "jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
@SpringBootTest(properties = {
        "spring.datasource.url=${HYBRIDFLOW_TEST_DB_URL}", "spring.datasource.username=hybridflow_test",
        "spring.datasource.hikari.maximum-pool-size=6", "spring.datasource.hikari.minimum-idle=1",
        "spring.datasource.password=hybridflow_test", "spring.jpa.show-sql=false",
        "hybridflow.scheduler.enabled=false",
        "google.oauth.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "logging.level.com.hybridflow=WARN", "logging.level.org.hibernate=WARN" })
@AutoConfigureMockMvc
class SyncApiIntegrationTest {
    @Test void deliveryErrorsPersistMachineCodeAndCorrelationForHistoryQueries() throws Exception {
        String body = routedRequest("delivery-error");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        source("READY");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        when(telegram.sendDetailedMessage(any(), anyString())).thenReturn(TelegramDeliveryResult.builder()
                .success(false).retryable(false).errorCode("ACCESS_DENIED").error("Bot chưa có quyền gửi tin.").build());
        assertTrue(outbox.processNext());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE state='DEAD' AND error_code='ACCESS_DENIED' AND correlation_id IS NOT NULL", Integer.class));
        mvc.perform(get("/api/v1/workflows/delivery-error/notifications"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.errorCode=='ACCESS_DENIED')].correlationId").isNotEmpty());
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @MockBean GoogleSheetsService sheets;
    @MockBean GoogleOAuthService oauth;
    @MockBean TelegramNotificationService telegram;
    @Autowired GoogleCredentialService credentials;
    @Autowired WorkflowJobService scheduler;
    @Autowired SyncExecutionService execution;
    @Autowired NotificationOutboxService outbox;

    @BeforeEach void cleanDatabase() {
        jdbc.execute("TRUNCATE notification_outbox,workflow_jobs,sheet_write_journal,sync_conflicts,sync_snapshots,vault_records,sync_flow_bindings,sync_executions,workflow_definitions,google_connections RESTART IDENTITY");
        source("NEW");
        doAnswer(call -> {
            Map<String, String> cells = call.getArgument(2);
            if (cells.containsKey("'Data'!B2")) source(cells.get("'Data'!B2"));
            return null;
        }).when(sheets).updateCells(anyString(), anyString(), anyMap());
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

    private String routedRequest(String flow) {
        return request(flow).replace("\"conflictPolicy\":\"ASK_TELEGRAM\"", """
                "conflictPolicy":"ASK_TELEGRAM",
                "routers":[{"nodeId":"r1","conditions":[{"columnName":"status","operator":"EQUALS","value":"READY"}],"actionNodeIds":["t1","t2"]},
                  {"nodeId":"r2","conditions":[{"columnName":"status","operator":"IS_NOT_EMPTY"}],"actionNodeIds":["t1","t3"]}],
                "actions":[{"nodeId":"t1","chatId":"1","recordTemplate":"Ops {id}:{status}","conflictTemplate":"Conflict {recordId}:{columnName}"},
                  {"nodeId":"t2","chatId":"2","recordTemplate":"Manager {id}"},
                  {"nodeId":"t3","chatId":"3","recordTemplate":"Audit {status}"}],
                "conflictActionIds":["t1"]
                """);
    }

    @Test void twoRoutersThreeActionsBootstrapNoChangeAndConflictTemplatesUseTheRealOutbox() throws Exception {
        String body = routedRequest("routed");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsQueued").value(0));
        source("READY");
        String response = mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsQueued").value(3)).andReturn().getResponse().getContentAsString();
        String executionId = new ObjectMapper().readTree(response).path("executionId").asText();
        assertEquals(List.of("Audit READY", "Manager 1", "Ops 1:READY"), jdbc.queryForList("SELECT message FROM notification_outbox ORDER BY message", String.class));
        mvc.perform(get("/api/v1/workflows/routed/notifications").param("executionId", executionId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3));
        mvc.perform(get("/api/v1/workflows/routed/notifications").param("executionId", "other"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsQueued").value(0));
        source("A");
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"B\"') WHERE flow_id='routed'");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsQueued").value(1));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE message='Conflict 1:status'", Integer.class));
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsQueued").value(0));
        String notification = jdbc.queryForObject("SELECT id FROM notification_outbox WHERE destination='2'", String.class);
        jdbc.update("UPDATE notification_outbox SET state='DEAD' WHERE id=?", notification);
        mvc.perform(post("/api/v1/notifications/" + notification + "/retry")).andExpect(status().isOk());
        assertEquals("PENDING", jdbc.queryForObject("SELECT state FROM notification_outbox WHERE id=?", String.class, notification));
        mvc.perform(post("/api/v1/notifications/" + notification + "/retry")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/workflows/routed/notifications").param("executionId", executionId).param("limit", "2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/v1/workflows/routed/notifications").param("executionId", executionId).param("limit", "2").param("offset", "2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/v1/workflows/routed/notifications").param("offset", "-1"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(telegram);
    }

    @Test void databaseFailureAfterSheetWriteRollsBackOutboxAndCheckpointAndTheNextRunRecreatesEvents() throws Exception {
        String body = routedRequest("rollback-notification");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"READY\"') WHERE flow_id='rollback-notification'");
        jdbc.execute("CREATE FUNCTION fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$");
        jdbc.execute("CREATE TRIGGER fail_notification BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION fail_notification()");
        try {
            mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isInternalServerError());
            verify(sheets).updateCells("test-token", "sheet", Map.of("'Data'!B2", "READY"));
            assertEquals("NEW", statusOf("sync_snapshots", "rollback-notification"));
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Integer.class));
            verifyNoInteractions(telegram);
        } finally {
            jdbc.execute("DROP TRIGGER fail_notification ON notification_outbox");
            jdbc.execute("DROP FUNCTION fail_notification()");
        }
        source("READY");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsQueued").value(3));
        assertEquals("READY", statusOf("sync_snapshots", "rollback-notification"));
    }

    @Test void invalidTemplateFailsAfterReadBeforeAnySheetOrCheckpointWrite() throws Exception {
        String body = routedRequest("invalid-template");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        source("READY"); clearInvocations(sheets);
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body.replace("Conflict {recordId}:{columnName}", "Conflict {status}")))
                .andExpect(status().isBadRequest());
        verify(sheets).readSheet(any());
        verify(sheets, never()).updateCells(anyString(), anyString(), anyMap());
        assertEquals("NEW", statusOf("sync_snapshots", "invalid-template"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Integer.class));
    }

    @Test void inventoryRulesNotifyOnlyVerifiedUpdatesAndAllowLaterRevisionsOfTheSameValue() throws Exception {
        AtomicReference<String> quantity = new AtomicReference<>("12");
        when(sheets.readSheet(any())).thenAnswer(call -> SheetDataResponse.builder().sheetName("Data")
                .headers(List.of("id", "quantity")).rows(List.of(Map.of("id", "1", "quantity", quantity.get())))
                .valueTypes(List.of(Map.of("quantity", "NUMBER"))).build());
        String body = request("inventory").replace("\"conflictPolicy\":\"ASK_TELEGRAM\"", """
                "conflictPolicy":"ASK_TELEGRAM","columnTypes":{"quantity":"NUMBER"},
                "routers":[{"nodeId":"r","triggerOn":"UPDATED","matchMode":"ALL","actionNodeIds":["t"],
                "conditions":[{"columnName":"quantity","operator":"LESS_THAN","value":"10"},
                {"columnName":"quantity","operator":"COLUMN_CHANGED"}]}],
                "actions":[{"nodeId":"t","chatId":"123","recordTemplate":"Stock {quantity}"}]
                """);
        String[] quantities = {"12", "8", "8", "7", "12", "8"};
        int[] queued = {0, 1, 0, 1, 0, 1};
        for (int index = 0; index < quantities.length; index++) {
            quantity.set(quantities[index]);
            mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsQueued").value(queued[index]));
        }
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE flow_id='inventory'", Integer.class));
        assertEquals(5L, jdbc.queryForObject("SELECT revision FROM sync_snapshots WHERE flow_id='inventory'", Long.class));
        assertEquals(3, jdbc.queryForObject("SELECT count(DISTINCT source_key) FROM notification_outbox WHERE flow_id='inventory'", Integer.class));
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("\"value\":\"10\"", "\"value\":\"abc\""))).andExpect(status().isBadRequest());
        assertEquals(5L, jdbc.queryForObject("SELECT revision FROM sync_snapshots WHERE flow_id='inventory'", Long.class));
        verifyNoInteractions(telegram);
    }

    @Test void failedReadBackDoesNotAdvanceRevisionOrEnqueueBusinessNotifications() throws Exception {
        String body = routedRequest("verify-failure");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"READY\"') WHERE flow_id='verify-failure'");
        // Provider accepts the request but a subsequent read still contains the old value.
        doNothing().when(sheets).updateCells(anyString(), anyString(), anyMap());
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SYNC_VERIFY_FAILED"));
        assertEquals("NEW", statusOf("sync_snapshots", "verify-failure"));
        assertEquals(1L, jdbc.queryForObject("SELECT revision FROM sync_snapshots WHERE flow_id='verify-failure'", Long.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_outbox", Integer.class));
        verifyNoInteractions(telegram);
    }

    @Test void numericPriceRepairAndConflictResolutionKeepTheNumericWriteContract() throws Exception {
        String body = request("numeric-price").replace("\"conflictPolicy\":\"ASK_TELEGRAM\"", "\"conflictPolicy\":\"ASK_TELEGRAM\",\"columnTypes\":{\"price\":\"NUMBER\"}");
        AtomicReference<String> price = new AtomicReference<>("20000");
        AtomicReference<String> priceType = new AtomicReference<>("TEXT");
        when(sheets.readSheet(any())).thenAnswer(call -> SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "price"))
                .rows(List.of(Map.of("id", "00123", "price", price.get()))).valueTypes(List.of(Map.of("price", priceType.get()))).build());
        doAnswer(call -> {
            Map<String, String> cells = call.getArgument(2);
            Map<String, String> types = call.getArgument(3);
            price.set(cells.get("'Data'!B2"));
            priceType.set(types.get("'Data'!B2"));
            return null;
        }).when(sheets).updateTypedCells(anyString(), anyString(), anyMap(), anyMap());
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        verify(sheets).updateTypedCells("test-token", "sheet", Map.of("'Data'!B2", "20000"), Map.of("'Data'!B2", "NUMBER"));
        assertEquals("20000", jdbc.queryForObject("SELECT data->>'price' FROM sync_snapshots WHERE flow_id='numeric-price'", String.class));
        price.set("30000");
        priceType.set("NUMBER");
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{price}','\"40000\"') WHERE flow_id='numeric-price'");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        Long conflictId = jdbc.queryForObject("SELECT id FROM sync_conflicts WHERE status='OPEN'", Long.class);
        mvc.perform(post("/api/v1/conflicts/" + conflictId + "/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"resolvedValue\":\"40000\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isOk());
        verify(sheets).updateTypedCells("test-token", "sheet", Map.of("'Data'!B2", "40000"), Map.of("'Data'!B2", "NUMBER"));
        assertEquals("40000", jdbc.queryForObject("SELECT data->>'price' FROM sync_snapshots WHERE flow_id='numeric-price'", String.class));
        when(sheets.readSheet(any())).thenReturn(SheetDataResponse.builder().sheetName("Data").headers(List.of("id", "price"))
                .rows(List.of(Map.of("id", "00123", "price", "not-a-number"))).build());
        clearInvocations(sheets);
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        verify(sheets, never()).updateTypedCells(any(), any(), any(), any());
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
        mvc.perform(post("/api/v1/sync/run").header("X-Correlation-ID", "ad97a658-4ab2-4a33-b176-8310219b04bd")
                .contentType(MediaType.APPLICATION_JSON).content(request("flow-one")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SYNC_RECOVERY_REQUIRED"));
        assertEquals("SYNC_RECOVERY_REQUIRED", jdbc.queryForObject("SELECT error_code FROM sync_executions WHERE status='ERROR'", String.class));
        assertEquals("ad97a658-4ab2-4a33-b176-8310219b04bd", jdbc.queryForObject("SELECT correlation_id FROM sync_executions WHERE status='ERROR'", String.class));
        assertEquals("NEW", statusOf("sync_snapshots", "flow-one"));
        assertEquals("CANCELLED", statusOf("vault_records", "flow-one"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM sync_executions WHERE status='ERROR'", Integer.class));
    }

    @Test void resolvedConflictsDisappearAndDoNotSendAnotherTelegramAlert() throws Exception {
        run("flow-one");
        source("SHIPPING");
        jdbc.update("UPDATE vault_records SET data=jsonb_set(data,'{status}','\"CANCELLED\"') WHERE flow_id='flow-one'");
        when(telegram.sendDetailedMessage(any(), eq("123"))).thenReturn(TelegramDeliveryResult.builder().success(true).build());
        String notifyingRequest = request("flow-one").replace("\"notifyConflicts\":false", "\"notifyConflicts\":true,\"chatId\":\"123\"");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(notifyingRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notificationsSent").value(0))
                .andExpect(jsonPath("$.notificationsQueued").value(1));
        assertTrue(outbox.processNext());
        Long id = jdbc.queryForObject("SELECT id FROM sync_conflicts WHERE status='OPEN'", Long.class);
        mvc.perform(post("/api/v1/conflicts/" + id + "/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"resolvedValue\":\"CANCELLED\",\"accessToken\":\"test-token\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/conflicts").param("flowId", "flow-one"))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(post("/api/v1/conflicts/" + id + "/notify").contentType(MediaType.APPLICATION_JSON)
                .content("{\"chatId\":\"123\"}"))
                .andExpect(status().isConflict());
        // The next read reflects the value that the successful resolution wrote to Google Sheets.
        source("CANCELLED");
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(notifyingRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.conflicts.length()").value(0))
                .andExpect(jsonPath("$.notificationsSent").value(0));
        verify(telegram, times(1)).sendDetailedMessage(any(), eq("123"));
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

    @Test void savedWorkflowManualBootstrapThenScheduledRunUsesTheSameCheckpoint() throws Exception {
        String connection = credentials.store(new GoogleTokenResponse()
                .setAccessToken("test-access").setRefreshToken("test-refresh").setExpiresInSeconds(3600L));
        String graph = """
                {"accessToken":"%s","nodes":[
                 {"id":"timer","type":"scheduleTrigger","data":{"scheduleIntervalMinutes":5}},
                 {"id":"sheet","type":"sheetsTrigger","data":{"spreadsheetId":"sheet","sheetName":"Data"}},
                 {"id":"diff","type":"diffEngine","data":{"uniqueKey":"id","sharedColumns":"status","conflictPolicy":"SOURCE_WINS"}},
                 {"id":"vault","type":"storageAction","data":{"tableName":"vault"}}],
                 "edges":[{"source":"timer","sourceHandle":"out","target":"diff","targetHandle":"trigger"},
                 {"source":"sheet","sourceHandle":"out","target":"diff","targetHandle":"in"},
                 {"source":"diff","sourceHandle":"clean","target":"vault","targetHandle":"in"}]}
                """.formatted(connection);
        mvc.perform(put("/api/v1/workflows/editor/definition").contentType(MediaType.APPLICATION_JSON).content(graph)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/workflows/editor/definition")).andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").doesNotExist());
        String manual = mvc.perform(post("/api/v1/workflows/editor/run").param("bootstrapConfirmed", "true"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.bootstrapRequired").value(false)).andReturn().getResponse().getContentAsString();
        String flow = new ObjectMapper().readTree(manual).path("flowId").asText();
        assertEquals("flow-985d2076bff98552d3637ea2b5f4678c6861575eb9f169e9bf2d6bb3ad92b15e", flow);
        assertEquals("NEW", statusOf("sync_snapshots", flow));
        source("UPDATED");
        jdbc.update("UPDATE workflow_definitions SET next_run_at=now()-interval '1 second' WHERE flow_id='editor'");
        scheduler.enqueueDue(); scheduler.runNext();
        assertEquals("UPDATED", statusOf("sync_snapshots", flow));
        assertEquals("UPDATED", statusOf("vault_records", flow));
        assertEquals("SUCCEEDED", jdbc.queryForObject("SELECT state FROM workflow_jobs", String.class));
        List<String> progress = jdbc.queryForList("SELECT progress::text FROM sync_executions WHERE flow_id=? ORDER BY started_at", String.class, flow);
        assertFalse(progress.get(0).contains("TRIGGER"), "Manual runs must not claim to have been triggered by a timer");
        assertTrue(progress.get(1).contains("TRIGGER"));
        assertTrue(progress.get(1).contains("READ"));
        assertTrue(progress.get(1).contains("COMPARE"));
        assertTrue(progress.get(1).contains("WRITE"));
        assertFalse(progress.get(1).contains("NOTIFY"), "No conflict means the Telegram branch was not executed");
        mvc.perform(get("/api/v1/workflows/editor/schedule")).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("SUCCEEDED")).andExpect(jsonPath("$.last_run_at").isNotEmpty());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM sync_executions WHERE flow_id=?", Integer.class, flow));
    }

    @Test void actualReadPhaseIsVisibleBeforeTheSyncTransactionCompletes() throws Exception {
        CountDownLatch reading = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(sheets.readSheet(any())).thenAnswer(invocation -> {
            reading.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            return SheetDataResponse.builder().spreadsheetId("sheet").sheetName("Data").headers(List.of("id", "status"))
                    .rows(List.of(Map.of("id", "1", "status", "NEW"))).totalRows(1).build();
        });
        RunSyncRequest request = RunSyncRequest.builder()
                .flowId("live-progress").accessToken("test-access").spreadsheetId("sheet").sheetName("Data").idColumn("id")
                .bootstrapConfirmed(true).executionNodes(Map.of("sheets", List.of("sheet-node"), "diff", List.of("diff-node"), "storage", List.of("vault-node"))).build();
        try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
            Future<?> running = pool.submit(() -> execution.executeSync(request));
            try {
                assertTrue(reading.await(5, TimeUnit.SECONDS));
                assertEquals("RUNNING", jdbc.queryForObject("SELECT status FROM sync_executions WHERE flow_id='live-progress'", String.class));
                String progress = jdbc.queryForObject("SELECT progress::text FROM sync_executions WHERE flow_id='live-progress'", String.class);
                assertTrue(progress.contains("READ"));
                assertTrue(progress.contains("sheet-node"));
                assertFalse(progress.contains("WRITE"));
            } finally { release.countDown(); }
            running.get(5, TimeUnit.SECONDS);
        }
        assertEquals("SUCCESS", jdbc.queryForObject("SELECT status FROM sync_executions WHERE flow_id='live-progress'", String.class));
        assertTrue(jdbc.queryForObject("SELECT progress::text FROM sync_executions WHERE flow_id='live-progress'", String.class).contains("vault-node"));
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
            ReadSheetRequest request = inv.getArgument(0);
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
                .andExpect(status().isConflict());
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
        AtomicBoolean failOnce = new AtomicBoolean(true);
        doAnswer(inv -> {
            Map<String, String> cells = inv.getArgument(2);
            live.put("c", cells.get("'Data'!B2"));
            if (failOnce.getAndSet(false)) throw new IllegalStateException("ambiguous timeout");
            return null;
        }).when(sheets).updateCells(anyString(), eq("c"), anyMap());
        mvc.perform(post("/api/v1/sync/run").contentType(MediaType.APPLICATION_JSON).content(multiRequest()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SYNC_RECOVERY_REQUIRED"));
        assertEquals(Map.of("a", "EDITED", "b", "NEW", "c", "NEW"), live);
        assertEquals("NEW", statusOf("sync_snapshots", "multi"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM sheet_write_journal WHERE status='PENDING'", Integer.class));
        runMulti();
        assertEquals(Map.of("a", "EDITED", "b", "EDITED", "c", "EDITED"), live);
        assertEquals("EDITED", statusOf("sync_snapshots", "multi"));
    }
}
