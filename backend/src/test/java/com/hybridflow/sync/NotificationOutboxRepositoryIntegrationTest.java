package com.hybridflow.sync;

import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.repository.NotificationOutboxRepository;
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
import java.time.Instant;
import java.util.UUID;
import java.util.List;
import java.util.Set;
import java.util.HashSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledIfEnvironmentVariable(named = "HYBRIDFLOW_TEST_DB_URL", matches = "jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
class NotificationOutboxRepositoryIntegrationTest {
    private JdbcTemplate jdbc;
    private JdbcTemplate admin;
    private NotificationOutboxRepository repository;
    private TransactionTemplate transaction;
    private String schema;

    @BeforeEach void setup() throws Exception {
        schema = "outbox_" + UUID.randomUUID().toString().replace("-", "");
        String url = System.getenv("HYBRIDFLOW_TEST_DB_URL");
        admin = new JdbcTemplate(new DriverManagerDataSource(url, "hybridflow_test", "hybridflow_test"));
        admin.execute("CREATE SCHEMA " + schema);
        DriverManagerDataSource source = new DriverManagerDataSource(url + "?currentSchema=" + schema, "hybridflow_test", "hybridflow_test");
        jdbc = new JdbcTemplate(source);
        jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/V10__notification_outbox.sql")));
        jdbc.execute("ALTER TABLE notification_outbox ADD COLUMN error_code VARCHAR(64), ADD COLUMN correlation_id VARCHAR(36), ADD COLUMN workspace_id UUID, ADD COLUMN connection_id VARCHAR(50)");
        jdbc.execute("CREATE TABLE workspace_connections(id VARCHAR(50) PRIMARY KEY,workspace_id UUID,state VARCHAR(30))");
        repository = new NotificationOutboxRepository(jdbc);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    }

    @AfterEach void cleanup() { if (schema != null) admin.execute("DROP SCHEMA " + schema + " CASCADE"); }

    private NotificationOutboxItem item(String key) {
        return NotificationOutboxItem.builder().flowId("flow").executionId("execution").actionNodeId("a")
                .channel("TELEGRAM").destination("123").sourceType("CONFLICT").sourceKey(key)
                .message("already rendered").availableAt(Instant.now().minusSeconds(1)).build();
    }

    @Test void duplicateKeysAndExecutionFilteringUseRealPostgres() {
        assertTrue(repository.enqueue(item("one")));
        assertFalse(repository.enqueue(item("one")));
        assertTrue(repository.exists("a", "CONFLICT", "one"));
        assertEquals(1, repository.findByFlowId("flow", "execution", 50).size());
        assertTrue(repository.findByFlowId("flow", "different", 50).isEmpty());
    }

    @Test void checkpointAndOutboxRollbackTogether() {
        jdbc.execute("CREATE TABLE checkpoint (id INTEGER PRIMARY KEY)");
        transaction.executeWithoutResult(status -> {
            jdbc.update("INSERT INTO checkpoint VALUES (1)");
            repository.enqueue(item("one"));
            status.setRollbackOnly();
        });
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM checkpoint", Integer.class));
        assertFalse(repository.exists("a", "CONFLICT", "one"));
        assertTrue(repository.enqueue(item("one")));
    }

    @Test void expiredFinalAttemptCanBeReclaimedAndOldOwnerCannotMarkItSent() {
        repository.enqueue(item("one"));
        jdbc.update("UPDATE notification_outbox SET attempts=4");
        Instant now = Instant.now();
        NotificationOutboxItem first = repository.claim(now, 60, 5).orElseThrow();
        assertEquals(5, first.getAttempts());
        assertTrue(repository.claim(now.plusSeconds(1), 60, 5).isEmpty());
        NotificationOutboxItem recovered = repository.claim(now.plusSeconds(61), 60, 5).orElseThrow();
        assertEquals(5, recovered.getAttempts());
        assertNotEquals(first.getOwner(), recovered.getOwner());
        repository.markSent(first.getId(), first.getOwner(), now);
        assertEquals("SENDING", repository.findByFlowId("flow", null, 50).getFirst().getState());
        repository.markSent(recovered.getId(), recovered.getOwner(), now.plusSeconds(62));
        assertEquals("SENT", repository.findByFlowId("flow", null, 50).getFirst().getState());
    }

    @Test void rateLimitingRestoresAttemptAndManualRetryRecoversDeadMessages() {
        repository.enqueue(item("one"));
        Instant now = Instant.now();
        NotificationOutboxItem claimed = repository.claim(now, 60, 5).orElseThrow();
        repository.deferRateLimited(claimed.getId(), claimed.getOwner(), "429", now.plusSeconds(17));
        assertEquals(0, repository.findByFlowId("flow", null, 50).getFirst().getAttempts());
        assertTrue(repository.claim(now.plusSeconds(16), 60, 5).isEmpty());
        NotificationOutboxItem next = repository.claim(now.plusSeconds(18), 60, 5).orElseThrow();
        repository.markFailed(next.getId(), next.getOwner(), "403", now.plusSeconds(18), true);
        repository.retry(next.getId(), now.plusSeconds(19));
        assertEquals(1, repository.claim(now.plusSeconds(20), 60, 5).orElseThrow().getAttempts());
    }

    @Test void paginationIsStableAndNeverMixesExecutionsOrFlows() {
        for (int index = 0; index < 55; index++) repository.enqueue(item("page-" + index));
        NotificationOutboxItem other = item("other");
        other.setExecutionId("other-execution"); repository.enqueue(other);
        NotificationOutboxItem foreign = item("foreign");
        foreign.setFlowId("other-flow"); repository.enqueue(foreign);
        jdbc.update("UPDATE notification_outbox SET created_at='2026-11-04T00:00:00Z'");
        List<NotificationOutboxItem> first = repository.findByFlowId("flow", "execution", 50, 0);
        List<NotificationOutboxItem> second = repository.findByFlowId("flow", "execution", 50, 50);
        assertEquals(50, first.size()); assertEquals(5, second.size());
        Set<String> ids = new HashSet<>();
        first.forEach(row -> assertTrue(ids.add(row.getId())));
        second.forEach(row -> assertTrue(ids.add(row.getId())));
        assertTrue(repository.findByFlowId("flow", "execution", 50, 100).isEmpty());
    }

    @Test void recreatedWorkerRecoversPersistedLeaseAndRetryNeverResendsSentOrActiveMessages() {
        repository.enqueue(item("durable"));
        Instant now = Instant.now();
        NotificationOutboxItem old = repository.claim(now, 60, 5).orElseThrow();
        assertFalse(repository.retry(old.getId(), now));
        NotificationOutboxRepository restarted = new NotificationOutboxRepository(jdbc);
        assertTrue(restarted.claim(now.plusSeconds(59), 60, 5).isEmpty());
        NotificationOutboxItem recovered = restarted.claim(now.plusSeconds(61), 60, 5).orElseThrow();
        assertEquals(old.getId(), recovered.getId());
        restarted.markSent(recovered.getId(), recovered.getOwner(), now.plusSeconds(62));
        assertFalse(restarted.retry(recovered.getId(), now.plusSeconds(63)));
        assertFalse(restarted.retry("missing", now));
        assertEquals(1, restarted.findByFlowId("flow", "execution", 50).size());
    }
}
