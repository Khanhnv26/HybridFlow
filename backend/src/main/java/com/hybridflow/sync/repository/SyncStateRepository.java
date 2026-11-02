package com.hybridflow.sync.repository;

import com.hybridflow.sync.support.SyncJsonCodec;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

@Repository
@RequiredArgsConstructor
public class SyncStateRepository {
    private final JdbcTemplate jdbc;
    private final SyncJsonCodec codec;

    public void lock(String flowId) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext(?))", resultSet -> {}, flowId);
    }

    public Map<String, String> findSnapshot(String flowId, String recordId) {
        return read("sync_snapshots", flowId, recordId);
    }

    public Map<String, String> findVaultRecord(String flowId, String recordId) {
        return read("vault_records", flowId, recordId);
    }

    public void saveSnapshot(String flowId, String recordId, Map<String, String> data) {
        write("sync_snapshots", flowId, recordId, data);
    }

    public void saveVaultRecord(String flowId, String recordId, Map<String, String> data) {
        write("vault_records", flowId, recordId, data);
    }

    private Map<String, String> read(String table, String flowId, String recordId) {
        List<String> rows = jdbc.query("SELECT data::text FROM " + table + " WHERE flow_id=? AND record_id=?",
                (resultSet, rowNumber) -> resultSet.getString(1), flowId, recordId);
        return rows.isEmpty() ? null : codec.decodeRow(rows.get(0));
    }

    private void write(String table, String flowId, String recordId, Map<String, String> data) {
        jdbc.update("INSERT INTO " + table + " (flow_id,record_id,data,updated_at) VALUES (?,?,?::jsonb,CURRENT_TIMESTAMP) "
                        + "ON CONFLICT(flow_id,record_id) DO UPDATE SET data=EXCLUDED.data,updated_at=CURRENT_TIMESTAMP",
                flowId, recordId, codec.encode(data));
    }

    public List<String> findSnapshotRecordIds(String flowId) {
        return jdbc.queryForList("SELECT record_id FROM sync_snapshots WHERE flow_id=?", String.class, flowId);
    }

    public boolean hasSnapshots(String flowId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM sync_snapshots WHERE flow_id=?)", Boolean.class, flowId));
    }

    public List<Map<String, String>> findVaultRecords(String flowId) {
        return jdbc.query("SELECT data::text FROM vault_records WHERE flow_id=? ORDER BY record_id",
                (resultSet, rowNumber) -> codec.decodeRow(resultSet.getString(1)), flowId);
    }

}
