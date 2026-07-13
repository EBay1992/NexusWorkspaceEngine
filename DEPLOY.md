# Deploy

Production runs on [Render](https://dashboard.render.com/) from this repo’s `render.yaml`.

| Service | URL |
|---------|-----|
| Web | https://nexus.ehsanbayranvand.tech |
| API | https://api.nexus.ehsanbayranvand.tech |
| Relay | https://relay.nexus.ehsanbayranvand.tech |

## Demo accounts

Password for all seeded role accounts: `demo`

| Email | Role |
|-------|------|
| `owner@orbit.local` | owner |
| `editor@orbit.local` | editor |
| `viewer@orbit.local` | viewer |

Optional operator admin from Render env: `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Sharing

Owners can create role-based invite URLs:

`/join/{workspaceId}/{editor|viewer}/{token}`

Regenerating a link for a role revokes the previous token.
