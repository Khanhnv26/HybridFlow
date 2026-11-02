package com.hybridflow.sync.repository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
@Repository
@RequiredArgsConstructor
public class SheetWriteJournalRepository {
    private final JdbcTemplate jdbc;
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void start(String id, String plans) {
        jdbc.update("INSERT INTO sheet_write_journal(id,plans,status) VALUES (?,?::jsonb,'PENDING')", id, plans);
    }
    public List<Map<String, Object>> pending() {
        return jdbc.queryForList("SELECT id,plans::text AS plans FROM sheet_write_journal WHERE status='PENDING' ORDER BY created_at");
    }
    // Complete in the same transaction as snapshots, so rollback preserves the pending intent.
    public void complete(String id) {
        jdbc.update("UPDATE sheet_write_journal SET status='COMPLETED' WHERE id=?", id);
    }
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recovered(String id) {
        jdbc.update("UPDATE sheet_write_journal SET status='RECOVERED' WHERE id=?", id);
    }
}
