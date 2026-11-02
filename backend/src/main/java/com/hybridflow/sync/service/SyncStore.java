package com.hybridflow.sync.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@RequiredArgsConstructor
public class SyncStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public void lock(String flowId) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext(?))", rs -> { }, flowId);
    }

    public Map<String, String> read(String table, String flow, String recordId) {
        checkTable(table);
        List<String> rows = jdbc.query("SELECT data::text FROM " + table + " WHERE flow_id=? AND record_id=?",
                (rs, i) -> rs.getString(1), flow, recordId);
        return rows.isEmpty() ? null : decode(rows.get(0));
    }

    public void write(String table, String flow, String recordId, Map<String, String> data) {
        checkTable(table);
        jdbc.update("INSERT INTO " + table + " (flow_id,record_id,data,updated_at) VALUES (?,?,?::jsonb,CURRENT_TIMESTAMP) "
                + "ON CONFLICT(flow_id,record_id) DO UPDATE SET data=EXCLUDED.data,updated_at=CURRENT_TIMESTAMP",
                flow, recordId, encode(data));
    }

    // A flow cannot silently reuse another spreadsheet's checkpoints or change schema.
    public void bind(String flow, String spreadsheet, String sheet, String idColumn, List<String> headers, String storageName) {
        List<Map<String, Object>> existing = jdbc.queryForList("SELECT * FROM sync_flow_bindings WHERE flow_id=?", flow);
        String columns = encode(headers);
        if (!existing.isEmpty()) {
            Map<String, Object> old = existing.get(0);
            if (!Objects.equals(old.get("spreadsheet_id"), spreadsheet)
                    || !Objects.equals(old.get("sheet_name"), sheet)
                    || !Objects.equals(old.get("id_column"), idColumn)
                    || !Objects.equals(old.get("storage_name"), storageName)
                    || !parseList(old.get("columns_json").toString()).equals(headers)) {
                throw new IllegalArgumentException("Nguồn hoặc cấu trúc cột đã đổi. Tạo luồng mới và xác nhận khởi tạo lại.");
            }
        } else {
            jdbc.update("INSERT INTO sync_flow_bindings (flow_id,spreadsheet_id,sheet_name,id_column,columns_json,storage_name) VALUES (?,?,?,?,?::jsonb,?)",
                    flow, spreadsheet, sheet, idColumn, columns, storageName);
        }
    }

    public boolean hasSnapshots(String flow) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM sync_snapshots WHERE flow_id=?)", Boolean.class, flow));
    }

    public List<Map<String, String>> vault(String flow) {
        return jdbc.query("SELECT data::text FROM vault_records WHERE flow_id=? ORDER BY record_id",
                (rs, i) -> decode(rs.getString(1)), flow);
    }

    public String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException("Không thể mã hóa dữ liệu.", e); }
    }
    private Map<String, String> decode(String value) {
        try { return json.readValue(value, new TypeReference<Map<String, String>>() {}); }
        catch (Exception e) { throw new IllegalStateException("Dữ liệu snapshot không hợp lệ.", e); }
    }
    private List<String> parseList(String value) {
        try { return json.readValue(value, new TypeReference<List<String>>() {}); }
        catch (Exception e) { throw new IllegalStateException("Cấu trúc cột lưu không hợp lệ.", e); }
    }
    private void checkTable(String table) {
        if (!Set.of("vault_records", "sync_snapshots").contains(table)) throw new IllegalArgumentException("Bảng không hợp lệ.");
    }
}
