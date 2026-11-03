ALTER TABLE sync_executions ADD COLUMN error_code VARCHAR(64), ADD COLUMN correlation_id VARCHAR(36);
ALTER TABLE workflow_jobs ADD COLUMN error_code VARCHAR(64), ADD COLUMN correlation_id VARCHAR(36);
ALTER TABLE notification_outbox ADD COLUMN error_code VARCHAR(64), ADD COLUMN correlation_id VARCHAR(36);
