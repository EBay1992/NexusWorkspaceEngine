-- Orbit Workspace Engine — gateway schema (PostgreSQL 16)

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_snapshots (
    id BIGSERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    scope_id TEXT NOT NULL DEFAULT 'default',
    payload BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_workspace
    ON workspace_snapshots (workspace_id, created_at DESC);
