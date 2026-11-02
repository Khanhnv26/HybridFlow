-- 1. Snapshot lưu bản gốc của bất kỳ sheet nào theo flow_id và record_id
CREATE TABLE IF NOT EXISTS sync_snapshots (
                                              id BIGSERIAL PRIMARY KEY,
                                              flow_id VARCHAR(100) NOT NULL DEFAULT 'default_flow',
                                              record_id VARCHAR(100) NOT NULL,
                                              data JSONB NOT NULL,
                                              updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                              CONSTRAINT uq_snapshot_flow_record UNIQUE (flow_id, record_id)
);

-- 2. Kho lưu trữ bản ghi phía hệ thống (Vault) lưu động theo JSONB
CREATE TABLE IF NOT EXISTS vault_records (
                                             id BIGSERIAL PRIMARY KEY,
                                             flow_id VARCHAR(100) NOT NULL DEFAULT 'default_flow',
                                             record_id VARCHAR(100) NOT NULL,
                                             data JSONB NOT NULL,
                                             updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                             CONSTRAINT uq_vault_flow_record UNIQUE (flow_id, record_id)
);

CREATE INDEX idx_snapshots_flow_record ON sync_snapshots(flow_id, record_id);
CREATE INDEX idx_vault_flow_record ON vault_records(flow_id, record_id);