# Deploy on Render

1. Open [Render Dashboard](https://dashboard.render.com/) and connect the GitHub repo `EBay1992/NexusWorkspaceEngine`.
2. **New → Blueprint** and select this repository. Render reads `render.yaml` at the repo root.
3. After the first deploy, open each service in Render and add custom domains:
   - `nexus-orbit-web` → `nexus.ehsanbayranvand.tech`
   - `nexus-orbit-gateway` → `api.nexus.ehsanbayranvand.tech`
   - `nexus-orbit-relay` → `relay.nexus.ehsanbayranvand.tech`
4. In Cloudflare, create **CNAME** records to the targets Render shows for each custom domain. Use **DNS only** (grey cloud) so WebSockets work reliably.
5. Copy the generated `ADMIN_PASSWORD` from the `nexus-orbit-gateway` service environment in Render. Sign in at `https://nexus.ehsanbayranvand.tech/login` with:
   - Email: `admin@ehsanbayranvand.tech`
   - Password: value of `ADMIN_PASSWORD`

Services use Docker images from this monorepo. The gateway applies `services/gateway/Sql/schema.sql` on startup and creates the `main` workspace for the admin user.
