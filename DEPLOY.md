# Deploy on Render

## CLI setup (one-time)

```bash
brew install render
render login
render workspace set "Ehsan's workspace"
```

Connect GitHub at [Render Dashboard → Account Settings](https://dashboard.render.com/) if not already linked (repo: [EBay1992/NexusWorkspaceEngine](https://github.com/EBay1992/NexusWorkspaceEngine)).

## Provision stack

```bash
# Validate blueprint (optional)
render blueprints validate render.yaml

# Create Postgres + three Docker web services from GitHub
bash scripts/render-provision.sh
```

Generated credentials are written to `.render-local/secrets.env` (gitignored).

## Custom domains (Cloudflare)

After services deploy, point DNS to Render (grey cloud / DNS only):

| Host | Service | Render dashboard |
|------|---------|------------------|
| `nexus.ehsanbayranvand.tech` | `nexus-orbit-web` | [web](https://dashboard.render.com/web/srv-d9ailto458ps739os560) |
| `api.nexus.ehsanbayranvand.tech` | `nexus-orbit-gateway` | [gateway](https://dashboard.render.com/web/srv-d9ails6rnols73b52d2g) |
| `relay.nexus.ehsanbayranvand.tech` | `nexus-orbit-relay` | [relay](https://dashboard.render.com/web/srv-d9ailstaeets73e39e7g) |

Sign in at `https://nexus.ehsanbayranvand.tech/login` with `admin@ehsanbayranvand.tech` and the `ADMIN_PASSWORD` from `.render-local/secrets.env` or the gateway service env in Render.

## Blueprint alternative

You can also use **New → Blueprint** in the [Render Dashboard](https://dashboard.render.com/) and select this repo; Render reads `render.yaml` at the root.
