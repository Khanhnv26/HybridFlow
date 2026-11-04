package com.hybridflow.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.model.WorkflowJob;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.repository.NotificationOutboxRepository;
import com.hybridflow.sync.service.NotificationOutboxService;
import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.notification.dto.response.TelegramDeliveryResult;
import com.hybridflow.sync.repository.WorkflowJobRepository;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.service.WorkflowJobService;
import com.hybridflow.sync.service.WorkflowService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@EnabledIfEnvironmentVariable(named = "HYBRIDFLOW_TEST_DB_URL", matches = "jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
@SpringBootTest(properties = {"spring.datasource.url=${HYBRIDFLOW_TEST_DB_URL}", "spring.datasource.username=hybridflow_test",
        "spring.datasource.hikari.maximum-pool-size=6", "spring.datasource.hikari.minimum-idle=1",
        "spring.datasource.password=hybridflow_test", "spring.jpa.show-sql=false", "hybridflow.scheduler.enabled=false",
        "google.oauth.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "logging.level.com.hybridflow=WARN"})
class WorkflowScheduleIntegrationTest {
    @Test void permanentAndUnexpectedErrorsStopImmediatelyWithSafeDiagnostics() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue();
        when(execution.executeSync(any())).thenThrow(new NullPointerException("private-provider-detail"));
        scheduler.runNext();
        assertEquals("DEAD", state());
        assertEquals("INTERNAL_ERROR", jdbc.queryForObject("SELECT error_code FROM workflow_jobs", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT attempts FROM workflow_jobs", Integer.class));
        assertNotNull(jdbc.queryForObject("SELECT correlation_id FROM workflow_jobs", String.class));
        assertFalse(jdbc.queryForObject("SELECT error FROM workflow_jobs", String.class).contains("private-provider-detail"));
        now.set(now.get().plusSeconds(1000)); scheduler.enqueueDue(); scheduler.runNext();
        verify(execution, times(1)).executeSync(any());
    }

    @Test void invalidConfigurationDoesNotConsumeRepeatedRetries() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue();
        when(execution.executeSync(any())).thenThrow(new ValidationException("Chọn lại cột khóa."));
        scheduler.runNext();
        assertEquals("DEAD", state());
        assertEquals("INVALID_ARGUMENT", jdbc.queryForObject("SELECT error_code FROM workflow_jobs", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT attempts FROM workflow_jobs", Integer.class));
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired WorkflowService workflows;
    @Autowired WorkflowJobService scheduler;
    @Autowired WorkflowJobRepository jobs;
    @Autowired GoogleCredentialService credentials;
    @Autowired PlatformTransactionManager transactions;
    @Autowired ObjectMapper mapper;
    @Autowired NotificationOutboxRepository outbox;
    @Autowired NotificationOutboxService delivery;
    @MockBean TelegramNotificationService telegram;
    @MockBean GoogleOAuthService oauth;
    @MockBean SyncExecutionService execution;
    @MockBean Clock clock;
    private final AtomicReference<Instant> now = new AtomicReference<>();
    private String connection;

    @BeforeEach void setup() {
        jdbc.execute("TRUNCATE notification_outbox,workflow_jobs,sheet_write_journal,sync_conflicts,sync_snapshots,vault_records,sync_flow_bindings,sync_executions,workflow_definitions,google_connections RESTART IDENTITY CASCADE");
        now.set(Instant.parse("2026-11-03T02:00:00Z"));
        when(clock.instant()).thenAnswer(invocation -> now.get());
        connection = credentials.store(new GoogleTokenResponse().setAccessToken("access-test").setRefreshToken("refresh-test").setExpiresInSeconds(3600L));
        when(execution.executeSync(any())).thenReturn(RunSyncResponse.builder().status("SUCCESS").build());
    }

    private String graph(boolean enabled) {
        return """
                {"accessToken":"%s","nodes":[
                  {"id":"timer","type":"scheduleTrigger","data":{"scheduleEnabled":%s,"scheduleType":"interval","scheduleIntervalMinutes":5}},
                  {"id":"sheet","type":"sheetsTrigger","data":{"spreadsheetId":"file","sheetName":"Data"}},
                  {"id":"diff","type":"diffEngine","data":{"uniqueKey":"id","sharedColumns":"status","conflictPolicy":"SOURCE_WINS"}},
                  {"id":"store","type":"storageAction","data":{"tableName":"vault"}}],
                 "edges":[{"source":"timer","sourceHandle":"out","target":"diff","targetHandle":"trigger"},
                  {"source":"sheet","sourceHandle":"out","target":"diff","targetHandle":"in"},
                  {"source":"diff","sourceHandle":"clean","target":"store","targetHandle":"in"}]}
                """.formatted(connection, enabled);
    }

    private void save(String id, boolean enabled) throws Exception { workflows.saveDefinition(id, mapper.readTree(graph(enabled))); }
    private void due(String id) { jdbc.update("UPDATE workflow_definitions SET next_run_at=? WHERE flow_id=?", Timestamp.from(now.get()), id); }
    private String state() { return jdbc.queryForObject("SELECT state FROM workflow_jobs LIMIT 1", String.class); }
    private WorkflowJob claim() { return new TransactionTemplate(transactions).execute(status -> jobs.claim(now.get(), 120, 3).orElse(null)); }

    @Test void savedRoutersAndTemplatesSurviveReloadAndProduceTheSameManualAndScheduledPlans() throws Exception {
        ObjectNode definition = (ObjectNode) mapper.readTree(graph(true));
        ArrayNode nodes = (ArrayNode) definition.path("nodes");
        nodes.add(mapper.readTree("""
                {"id":"router","type":"routerCondition","data":{"routerTriggerOn":"UPDATED","routerMatchMode":"ANY",
                "routerConditions":[{"columnName":"status","operator":"EQUALS","value":"READY"}]}}
                """));
        nodes.add(mapper.readTree("""
                {"id":"telegram","type":"telegramAction","data":{"chatId":"123","recordTemplate":"Order {id}","conflictTemplate":"Conflict {recordId}"}}
                """));
        ArrayNode edges = (ArrayNode) definition.path("edges");
        edges.add(mapper.readTree("""
                {"source":"diff","sourceHandle":"clean","target":"router","targetHandle":"in"}
                """));
        edges.add(mapper.readTree("""
                {"source":"router","sourceHandle":"out","target":"telegram","targetHandle":"in"}
                """));
        edges.add(mapper.readTree("""
                {"source":"diff","sourceHandle":"conflict","target":"telegram","targetHandle":"in"}
                """));
        workflows.saveDefinition("routed-editor", definition);
        assertEquals(nodes, workflows.getDefinition("routed-editor").path("nodes"));
        assertEquals(edges, workflows.getDefinition("routed-editor").path("edges"));
        workflows.runDefinition("routed-editor", false);
        due("routed-editor"); scheduler.enqueueDue(); scheduler.runNext();
        ArgumentCaptor<RunSyncRequest> requests = ArgumentCaptor.forClass(RunSyncRequest.class);
        verify(execution, times(2)).executeSync(requests.capture());
        RunSyncRequest manual = requests.getAllValues().get(0);
        RunSyncRequest scheduled = requests.getAllValues().get(1);
        assertEquals(manual.getFlowId(), scheduled.getFlowId());
        assertEquals(mapper.valueToTree(manual.getRouters()), mapper.valueToTree(scheduled.getRouters()));
        assertEquals(mapper.valueToTree(manual.getActions()), mapper.valueToTree(scheduled.getActions()));
        assertEquals(manual.getConflictActionIds(), scheduled.getConflictActionIds());
        assertEquals("UPDATED", manual.getRouters().getFirst().getTriggerOn());
        assertEquals("Order {id}", manual.getActions().getFirst().getRecordTemplate());
    }

    @Test void savingUnchangedScheduleKeepsDueTimeAndChangingIntervalReschedules() throws Exception {
        save("editor", true);
        Instant due = now.get().plusSeconds(300);
        now.set(now.get().plusSeconds(240));
        save("editor", true);
        assertEquals(due, jdbc.queryForObject("SELECT next_run_at FROM workflow_definitions", Timestamp.class).toInstant());
        workflows.saveDefinition("editor", mapper.readTree(graph(true).replace("\"scheduleIntervalMinutes\":5", "\"scheduleIntervalMinutes\":15")));
        assertEquals(now.get().plusSeconds(900), jdbc.queryForObject("SELECT next_run_at FROM workflow_definitions", Timestamp.class).toInstant());
    }

    @Test void concurrentProducersAndWorkersClaimOnlyOneOccurrence() throws Exception {
        save("editor", true); due("editor");
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<?> first = pool.submit(scheduler::enqueueDue);
            Future<?> second = pool.submit(scheduler::enqueueDue);
            first.get(5, TimeUnit.SECONDS); second.get(5, TimeUnit.SECONDS);
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workflow_jobs", Integer.class));
            Future<WorkflowJob> left = pool.submit(this::claim);
            Future<WorkflowJob> right = pool.submit(this::claim);
            assertEquals(1, (left.get(5, TimeUnit.SECONDS) == null ? 0 : 1) + (right.get(5, TimeUnit.SECONDS) == null ? 0 : 1));
        }
    }

    @Test void failedSyncRetriesWithoutReportingSuccessAndStopsAtMaximumAttempts() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue();
        when(execution.executeSync(any())).thenThrow(new ApplicationException(ErrorCode.UPSTREAM_UNAVAILABLE, "Dịch vụ tạm thời chưa sẵn sàng.", new IllegalStateException("provider detail must stay private")));
        scheduler.runNext(); assertEquals("RETRY", state());
        assertNull(jdbc.queryForObject("SELECT last_run_at FROM workflow_definitions", Timestamp.class));
        assertFalse(jdbc.queryForObject("SELECT error FROM workflow_jobs", String.class).contains("provider detail"));
        now.set(now.get().plusSeconds(31)); scheduler.runNext();
        now.set(now.get().plusSeconds(61)); scheduler.runNext(); assertEquals("DEAD", state());
        now.set(now.get().plusSeconds(1000)); scheduler.enqueueDue(); scheduler.runNext();
        verify(execution, times(3)).executeSync(any());
    }

    @Test void expiredLeaseIsRecoveredAndOldOwnerIsFenced() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue();
        WorkflowJob old = claim(); assertNotNull(old);
        now.set(now.get().plusSeconds(121));
        WorkflowJob replacement = claim(); assertNotNull(replacement);
        assertNotEquals(old.getOwner(), replacement.getOwner());
        Boolean stillOwned = new TransactionTemplate(transactions).execute(status -> jobs.lockOwned(old));
        assertEquals(Boolean.FALSE, stillOwned);
        now.set(now.get().plusSeconds(121)); scheduler.runNext();
        assertEquals("SUCCEEDED", state());
        assertEquals(3, jdbc.queryForObject("SELECT attempts FROM workflow_jobs", Integer.class));
    }

    @Test void disabledWorkflowDoesNotStartQueuedJob() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue(); save("editor", false);
        scheduler.enqueueDue(); scheduler.runNext();
        assertEquals("CANCELLED", state()); verify(execution, never()).executeSync(any());
    }

    @Test void disablingAfterClaimBeforeExecutionFencesTheWaitingWorker() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue();
        WorkflowJob waiting = claim(); assertNotNull(waiting);
        save("editor", false); scheduler.enqueueDue();
        assertEquals("CANCELLED", state());
        Boolean owned = new TransactionTemplate(transactions).execute(status -> jobs.lockOwned(waiting));
        assertEquals(Boolean.FALSE, owned);
        verify(execution, never()).executeSync(any());
    }

    @Test void migrationFromV7ScrubsLegacyTokensAndConvertsVietnamScheduleToInstant() {
        String schema = "schedule_upgrade_test";
        String url = System.getenv("HYBRIDFLOW_TEST_DB_URL") + "?currentSchema=" + schema;
        Flyway before = Flyway.configure().dataSource(url, "hybridflow_test", "hybridflow_test")
                .schemas(schema).defaultSchema(schema).target("7").cleanDisabled(false).load();
        try {
            before.migrate();
            JdbcTemplate old = new JdbcTemplate(new DriverManagerDataSource(url, "hybridflow_test", "hybridflow_test"));
            old.update("""
                    INSERT INTO workflow_definitions(flow_id,definition,access_token,schedule_enabled,next_run_at)
                    VALUES ('legacy','{"nodes":[],"edges":[],"accessToken":"legacy-test-access","refreshToken":"legacy-test-refresh"}'::jsonb,
                        'legacy-test-access',TRUE,'2026-11-03 08:00:00')
                    """);
            Flyway.configure().dataSource(url, "hybridflow_test", "hybridflow_test")
                    .schemas(schema).defaultSchema(schema).load().migrate();
            assertEquals(Boolean.FALSE, old.queryForObject("SELECT jsonb_exists(definition,'accessToken') OR jsonb_exists(definition,'refreshToken') FROM workflow_definitions", Boolean.class));
            assertEquals(Instant.parse("2026-11-03T01:00:00Z"), old.queryForObject("SELECT next_run_at FROM workflow_definitions", Timestamp.class).toInstant());
            assertEquals(0, old.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema=? AND table_name='workflow_definitions' AND column_name='access_token'", Integer.class, schema));
        } finally { before.clean(); }
    }

    @Test void workerCrashAtMaximumAttemptsBecomesDeadWithoutCreatingAnotherJob() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue(); assertNotNull(claim());
        jdbc.update("UPDATE workflow_jobs SET attempts=3");
        now.set(now.get().plusSeconds(1000)); scheduler.enqueueDue(); scheduler.runNext();
        assertEquals("DEAD", state());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workflow_jobs", Integer.class));
        verify(execution, never()).executeSync(any());
    }

    @Test void uninitializedFlowWaitsForManualConfirmationWithoutRepeatedJobs() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue();
        when(execution.executeSync(any())).thenReturn(RunSyncResponse.builder().status("AWAITING_CONFIRMATION").bootstrapRequired(true).build());
        scheduler.runNext(); assertEquals("NEEDS_BOOTSTRAP", state());
        now.set(now.get().plusSeconds(1000)); scheduler.enqueueDue();
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workflow_jobs", Integer.class));
        when(execution.executeSync(any())).thenReturn(RunSyncResponse.builder().status("SUCCESS").build());
        workflows.runDefinition("editor", true);
        assertEquals("CANCELLED", state());
        assertNull(jdbc.queryForObject("SELECT error FROM workflow_jobs", String.class));
        scheduler.enqueueDue(); scheduler.runNext();
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workflow_jobs WHERE state='SUCCEEDED'", Integer.class));
    }

    @Test void fiveIndependentJobsRunConcurrentlyAndLiveWorkersCannotLoseExpiredLeases() throws Exception {
        for (int index = 0; index < 5; index++) {
            String id = "parallel-" + index;
            workflows.saveDefinition(id, mapper.readTree(graph(true).replace("\"file\"", "\"file-" + index + "\"")));
            due(id);
        }
        scheduler.enqueueDue();
        CountDownLatch started = new CountDownLatch(5);
        CountDownLatch release = new CountDownLatch(1);
        when(execution.executeSync(any())).thenAnswer(invocation -> {
            started.countDown();
            assertTrue(release.await(15, TimeUnit.SECONDS));
            return RunSyncResponse.builder().status("SUCCESS").build();
        });
        try (ExecutorService pool = Executors.newFixedThreadPool(5)) {
            List<Future<?>> workers = new ArrayList<>();
            for (int index = 0; index < 5; index++) workers.add(pool.submit(scheduler::runNext));
            try {
                assertTrue(started.await(10, TimeUnit.SECONDS), "All five independent jobs must enter execution before any completes");
                now.set(now.get().plusSeconds(121));
                assertNull(claim(), "Row lock fences active workers even after lease expires");
                outbox.enqueue(NotificationOutboxItem.builder().flowId("other-flow").executionId("other-execution")
                        .actionNodeId("telegram").channel("TELEGRAM").destination("test-chat").sourceType("RECORD")
                        .sourceKey("parallel-notification").message("Test only").availableAt(Instant.now().minusSeconds(1)).build());
                when(telegram.sendDetailedMessage("Test only", "test-chat"))
                        .thenReturn(TelegramDeliveryResult.builder().success(true).build());
                assertTrue(delivery.processNext(), "Outbox must progress while all five sync workers remain blocked");
                assertEquals("SENT", outbox.findByFlowId("other-flow", "other-execution", 50).getFirst().getState());
            } finally { release.countDown(); }
            for (Future<?> worker : workers) worker.get(10, TimeUnit.SECONDS);
        }
        assertEquals(5, jdbc.queryForObject("SELECT count(*) FROM workflow_jobs WHERE state='SUCCEEDED'", Integer.class));
        verify(execution, times(5)).executeSync(any());
    }

    @Test void manualAndScheduledRunsUseIdenticalIdentityAndColumnScope() throws Exception {
        save("editor", true);
        workflows.runDefinition("editor", true);
        due("editor"); scheduler.enqueueDue(); scheduler.runNext();
        ArgumentCaptor<RunSyncRequest> requests = ArgumentCaptor.forClass(RunSyncRequest.class);
        verify(execution, times(2)).executeSync(requests.capture());
        assertEquals(requests.getAllValues().get(0).getFlowId(), requests.getAllValues().get(1).getFlowId());
        assertEquals(Set.of("status"), requests.getAllValues().get(1).getSyncColumns());
        assertFalse(workflows.getDefinition("editor").has("accessToken"));
        assertFalse(jdbc.queryForObject("SELECT access_token FROM google_connections", String.class).contains("access-test"));
    }

    @Test void expiredConnectionRefreshesOnceAcrossConcurrentCallers() throws Exception {
        now.set(now.get().plusSeconds(3601));
        when(oauth.refreshToken("refresh-test")).thenReturn(new GoogleTokenResponse().setAccessToken("renewed-test").setExpiresInSeconds(3600L));
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<String> first = pool.submit(() -> credentials.resolveAccessToken(connection));
            Future<String> second = pool.submit(() -> credentials.resolveAccessToken(connection));
            assertEquals("renewed-test", first.get(5, TimeUnit.SECONDS));
            assertEquals("renewed-test", second.get(5, TimeUnit.SECONDS));
        }
        verify(oauth, times(1)).refreshToken("refresh-test");
    }

    @Test void revokedConnectionStopsRetriesAndReportsReconnectRequired() throws Exception {
        save("editor", true); due("editor"); scheduler.enqueueDue();
        now.set(now.get().plusSeconds(3601));
        when(oauth.refreshToken("refresh-test")).thenThrow(new GoogleReconnectRequiredException());
        scheduler.runNext(); assertEquals("NEEDS_CONNECTION", state());
        assertEquals("RECONNECT_REQUIRED", jdbc.queryForObject("SELECT state FROM google_connections", String.class));
        scheduler.enqueueDue(); scheduler.runNext();
        verify(execution, never()).executeSync(any());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workflow_jobs", Integer.class));
    }
}
