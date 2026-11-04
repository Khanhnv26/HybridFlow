CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    google_subject VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);