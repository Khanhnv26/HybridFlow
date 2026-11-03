CREATE TABLE notification_outbox (
    id             VARCHAR(36) PRIMARY KEY,
    flow_id        VARCHAR(100) NOT NULL,
    execution_id   VARCHAR(36),
    action_node_id VARCHAR(100) NOT NULL,
    channel        VARCHAR(20)  NOT NULL,
    destination    VARCHAR(200) NOT NULL,
    source_type    VARCHAR(20)  NOT NULL,
    source_key     VARCHAR(200) NOT NULL,
    message        TEXT NOT NULL,
    state          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    attempts       INTEGER NOT NULL DEFAULT 0,
    available_at   TIMESTAMPTZ NOT NULL,
    lease_until    TIMESTAMPTZ,
    owner          VARCHAR(36),
    last_error     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at        TIMESTAMPTZ,
    UNIQUE (action_node_id, source_type, source_key)
);

CREATE INDEX idx_outbox_available ON notification_outbox(state, available_at);
CREATE INDEX idx_outbox_flow ON notification_outbox(flow_id, created_at DESC);
