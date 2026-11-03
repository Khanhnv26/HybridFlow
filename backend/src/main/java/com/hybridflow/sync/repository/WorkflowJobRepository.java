package com.hybridflow.sync.repository;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.sync.model.ScheduledWorkflowRow;
import com.hybridflow.sync.model.WorkflowJob;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository @RequiredArgsConstructor
public class WorkflowJobRepository {
    private final JdbcTemplate jdbc;

    public void enqueue(ScheduledWorkflowRow row) {
        jdbc.update("""
                INSERT INTO workflow_jobs(id,workflow_id,revision,scheduled_at,definition,available_at)
                VALUES (?,?,?,?,?::jsonb,?) ON CONFLICT(workflow_id,revision,scheduled_at) DO NOTHING
                """, UUID.randomUUID().toString(), row.getFlowId(), row.getRevision(), Timestamp.from(row.getNextRunAt()),
                row.getDefinitionJson(), Timestamp.from(row.getNextRunAt()));
    }

    public void cancelObsolete(Instant now) {
        jdbc.update("""
                UPDATE workflow_jobs j SET state='CANCELLED',error=NULL,error_code=NULL,finished_at=?
                WHERE j.id IN (SELECT pending.id FROM workflow_jobs pending
                    WHERE pending.state IN ('READY','RETRY','RUNNING') AND NOT EXISTS (
                    SELECT 1 FROM workflow_definitions d WHERE d.flow_id=pending.workflow_id
                        AND d.schedule_enabled AND d.schedule_revision=pending.revision)
                    FOR UPDATE OF pending SKIP LOCKED)
                """, Timestamp.from(now));
    }

    public Optional<WorkflowJob> claim(Instant now, int leaseSeconds, int maxAttempts) {
        String owner = UUID.randomUUID().toString();
        List<WorkflowJob> jobs = jdbc.query("""
                WITH candidate AS (
                    SELECT j.id FROM workflow_jobs j JOIN workflow_definitions d ON d.flow_id=j.workflow_id
                    WHERE d.schedule_enabled AND d.schedule_revision=j.revision AND j.attempts < ?
                      AND ((j.state IN ('READY','RETRY') AND j.available_at <= ?)
                        OR (j.state='RUNNING' AND j.lease_until <= ?))
                    ORDER BY j.available_at LIMIT 1 FOR UPDATE OF j,d SKIP LOCKED
                )
                UPDATE workflow_jobs j SET state='RUNNING',owner=?,lease_until=?,attempts=attempts+1
                FROM candidate WHERE j.id=candidate.id RETURNING j.*
                """, (rs, number) -> WorkflowJob.builder().id(rs.getString("id")).workflowId(rs.getString("workflow_id"))
                .revision(rs.getLong("revision")).definition(rs.getString("definition")).owner(rs.getString("owner"))
                .attempts(rs.getInt("attempts")).build(), maxAttempts, Timestamp.from(now), Timestamp.from(now), owner,
                Timestamp.from(now.plusSeconds(leaseSeconds)));
        return jobs.stream().findFirst();
    }

    public boolean lockOwned(WorkflowJob job) {
        return !jdbc.queryForList("SELECT id FROM workflow_jobs WHERE id=? AND state='RUNNING' AND owner=? FOR UPDATE",
                String.class, job.getId(), job.getOwner()).isEmpty();
    }

    public void finish(WorkflowJob job, String state, String error, Instant now) {
        jdbc.update("UPDATE workflow_jobs SET state=?,error=?,error_code=CASE WHEN CAST(? AS TEXT) IS NULL THEN NULL ELSE error_code END,finished_at=?,lease_until=NULL WHERE id=? AND owner=? AND state='RUNNING'",
                state, error, error, Timestamp.from(now), job.getId(), job.getOwner());
    }

    public void recordFailure(WorkflowJob job, ErrorDetails details) {
        jdbc.update("UPDATE workflow_jobs SET error_code=?,correlation_id=? WHERE id=? AND owner=? AND state='RUNNING'",
                details.getCode().name(), details.getCorrelationId(), job.getId(), job.getOwner());
    }

    public void retry(WorkflowJob job, Instant available) {
        retry(job, available, "Đồng bộ thất bại; đang chờ thử lại.");
    }

    public void retry(WorkflowJob job, Instant available, String message) {
        jdbc.update("UPDATE workflow_jobs SET state='RETRY',error=?,available_at=?,lease_until=NULL WHERE id=? AND owner=? AND state='RUNNING'",
                message, Timestamp.from(available), job.getId(), job.getOwner());
    }

    public void expireExhausted(Instant now, int maxAttempts) {
        jdbc.update("""
                UPDATE workflow_jobs SET state='DEAD',error='Job hết số lần thử sau khi worker dừng.',finished_at=?
                WHERE id IN (SELECT id FROM workflow_jobs WHERE state='RUNNING' AND lease_until <= ? AND attempts >= ?
                    FOR UPDATE SKIP LOCKED)
                """, Timestamp.from(now), Timestamp.from(now), maxAttempts);
    }
}
