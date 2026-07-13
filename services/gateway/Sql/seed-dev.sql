-- Local development seed (mounted by docker-compose only)

INSERT INTO users (id, email, password_hash) VALUES
    ('11111111-1111-1111-1111-111111111111', 'owner@orbit.local', 'demo'),
    ('22222222-2222-2222-2222-222222222222', 'editor@orbit.local', 'demo'),
    ('33333333-3333-3333-3333-333333333333', 'viewer@orbit.local', 'demo')
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspaces (id, title)
VALUES ('main', 'Main workspace')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
    ('main', '11111111-1111-1111-1111-111111111111', 'owner'),
    ('main', '22222222-2222-2222-2222-222222222222', 'editor'),
    ('main', '33333333-3333-3333-3333-333333333333', 'viewer')
ON CONFLICT DO NOTHING;
