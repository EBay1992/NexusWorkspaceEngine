-- Orbit Workspace Engine — gateway schema (PostgreSQL 16)
-- Run: psql "$DATABASE_URL" -f Sql/schema.sql

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

-- Dev seed: demo user + demo workspace (password: demo)
INSERT INTO users (id, email, password_hash)
VALUES ('11111111-1111-1111-1111-111111111111', 'demo@orbit.local', 'demo')
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspaces (id, title)
VALUES ('demo', 'Demo workspace')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES ('demo', '11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT DO NOTHING;

-- Collaboration test users (password for all: demo)
INSERT INTO users (id, email, password_hash)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'editor@orbit.local', 'demo'),
  ('33333333-3333-3333-3333-333333333333', 'viewer@orbit.local', 'demo')
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES
  ('demo', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('demo', '33333333-3333-3333-3333-333333333333', 'viewer')
ON CONFLICT DO NOTHING;
