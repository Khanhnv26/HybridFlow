CREATE INDEX idx_outbox_execution_page
    ON notification_outbox(flow_id, execution_id, created_at DESC, id DESC);
