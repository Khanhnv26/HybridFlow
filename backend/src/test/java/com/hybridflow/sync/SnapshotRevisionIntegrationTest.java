package com.hybridflow.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterConditionItem;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.model.RecordChangeEvent;
import com.hybridflow.sync.repository.NotificationOutboxRepository;
import com.hybridflow.sync.repository.SyncStateRepository;
import com.hybridflow.sync.service.NotificationOutboxService;
import com.hybridflow.sync.service.impl.NotificationOutboxServiceImpl;
import com.hybridflow.sync.service.impl.NotificationTemplateServiceImpl;
import com.hybridflow.sync.service.impl.RuleEvaluationServiceImpl;
import com.hybridflow.sync.support.SyncJsonCodec;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@EnabledIfEnvironmentVariable(named = "HYBRIDFLOW_TEST_DB_URL", matches = "jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
class SnapshotRevisionIntegrationTest {
    private JdbcTemplate admin;
    private JdbcTemplate jdbc;
    private SyncStateRepository snapshots;
    private NotificationOutboxRepository repository;
    private TransactionTemplate transaction;
    private String schema;

    @BeforeEach
    void setup() throws Exception {
        String url = System.getenv("HYBRIDFLOW_TEST_DB_URL");
        schema = "revision_" + UUID.randomUUID().toString().replace("-", "");
        admin = new JdbcTemplate(new DriverManagerDataSource(url, "hybridflow_test", "hybridflow_test"));
        admin.execute("CREATE SCHEMA " + schema);
        DriverManagerDataSource source = new DriverManagerDataSource(url + "?currentSchema=" + schema, "hybridflow_test", "hybridflow_test");
        jdbc = new JdbcTemplate(source);
        for (String migration : List.of("V2__create_snapshot_and_vault_tables.sql", "V10__notification_outbox.sql", "V11__snapshot_revisions.sql")) {
            jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration", migration)));
        }
        snapshots = new SyncStateRepository(jdbc, new SyncJsonCodec(new ObjectMapper()));
        repository = new NotificationOutboxRepository(jdbc);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    }

    @AfterEach
    void cleanup() {
        if (schema != null) admin.execute("DROP SCHEMA " + schema + " CASCADE");
    }

    private NotificationOutboxService outbox() {
        return new NotificationOutboxServiceImpl(repository, new RuleEvaluationServiceImpl(),
                new NotificationTemplateServiceImpl(), List.of());
    }

    private int enqueue(NotificationOutboxService service, String execution) {
        RouterPlan rule = RouterPlan.builder().nodeId("rule").actionNodeIds(List.of("telegram"))
                .conditions(List.of(new RouterConditionItem("status", "EQUALS", "READY"))).build();
        RecordChangeEvent event = RecordChangeEvent.builder().recordId("1").kind("UPDATED")
                .revision(snapshots.findSnapshotRevision("flow", "1"))
                .before(Map.of("status", "NEW")).after(Map.of("status", "READY")).build();
        return service.enqueue("flow", execution, List.of(rule), List.of(ActionPlan.builder().nodeId("telegram").chatId("123").build()),
                List.of(event), Set.of("status"), List.of(), List.of());
    }

    @Test
    void stableRevisionsSurviveServiceRestartAndAllowTheSameValueInALaterRevision() {
        snapshots.saveSnapshot("flow", "1", Map.of("status", "NEW"));
        snapshots.saveSnapshot("flow", "1", Map.of("status", "READY"));
        assertEquals(2L, snapshots.findSnapshotRevision("flow", "1"));
        assertEquals(1, enqueue(outbox(), "execution-1"));
        snapshots.saveSnapshot("flow", "1", Map.of("status", "READY"));
        assertEquals(2L, snapshots.findSnapshotRevision("flow", "1"));
        assertEquals(0, enqueue(outbox(), "execution-2"));
        snapshots.saveSnapshot("flow", "1", Map.of("status", "NEW"));
        snapshots.saveSnapshot("flow", "1", Map.of("status", "READY"));
        assertEquals(4L, snapshots.findSnapshotRevision("flow", "1"));
        assertEquals(1, enqueue(outbox(), "execution-3"));
        assertEquals(2, repository.findByFlowId("flow", null, 20).size());
    }

    @Test
    void revisionCheckpointAndNotificationRollbackTogether() {
        snapshots.saveSnapshot("flow", "1", Map.of("status", "NEW"));
        transaction.executeWithoutResult(status -> {
            snapshots.saveSnapshot("flow", "1", Map.of("status", "READY"));
            assertEquals(1, enqueue(outbox(), "failed-execution"));
            status.setRollbackOnly();
        });
        assertEquals(1L, snapshots.findSnapshotRevision("flow", "1"));
        assertEquals("NEW", snapshots.findSnapshot("flow", "1").get("status"));
        assertFalse(repository.findByFlowId("flow", null, 20).stream().findAny().isPresent());
        transaction.executeWithoutResult(status -> {
            snapshots.saveSnapshot("flow", "1", Map.of("status", "READY"));
            assertEquals(1, enqueue(outbox(), "successful-execution"));
        });
        assertEquals(2L, snapshots.findSnapshotRevision("flow", "1"));
        assertEquals(1, repository.findByFlowId("flow", null, 20).size());
    }
}
