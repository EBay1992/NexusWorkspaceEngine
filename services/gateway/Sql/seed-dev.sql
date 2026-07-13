-- Local development seed (mounted by docker-compose only)

INSERT INTO users (id, email, password_hash)
VALUES ('11111111-1111-1111-1111-111111111111', 'admin@localhost', 'local-dev')
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspaces (id, title)
VALUES ('main', 'Main workspace')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES ('main', '11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT DO NOTHING;
