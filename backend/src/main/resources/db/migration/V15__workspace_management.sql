CREATE TABLE workspaces
(
    id         UUID PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members
(
    workspace_id UUID        NOT NULL REFERENCES workspaces (id),
    user_id      UUID        NOT NULL REFERENCES app_users (id),
    role         VARCHAR(10) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);
CREATE UNIQUE INDEX one_owner_per_workspace ON workspace_members (workspace_id) WHERE role='OWNER';
CREATE INDEX workspace_members_user ON workspace_members (user_id, workspace_id);

CREATE TABLE business_modules
(
    id           UUID PRIMARY KEY,
    workspace_id UUID          NOT NULL REFERENCES workspaces (id),
    name         VARCHAR(120)  NOT NULL,
    description  VARCHAR(1000) NOT NULL DEFAULT '',
    enabled      BOOLEAN       NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

CREATE TABLE workspace_invitations
(
    id           UUID PRIMARY KEY,
    workspace_id UUID         NOT NULL REFERENCES workspaces (id),
    email        VARCHAR(320) NOT NULL,
    role         VARCHAR(10)  NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
    token_hash   CHAR(64)     NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ  NOT NULL,
    state        VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING', 'ACCEPTED', 'REVOKED')),
    created_by   UUID         NOT NULL REFERENCES app_users (id),
    accepted_by  UUID REFERENCES app_users (id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE workspace_audit
(
    id             UUID PRIMARY KEY,
    workspace_id   UUID        NOT NULL REFERENCES workspaces (id),
    actor_user_id  UUID REFERENCES app_users (id),
    action         VARCHAR(80) NOT NULL,
    resource_id    VARCHAR(100),
    correlation_id VARCHAR(36),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspace_audit_recent ON workspace_audit (workspace_id, created_at DESC);