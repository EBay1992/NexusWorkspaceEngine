---
goal: Implement Orbit — a local-first distributed workspace builder (CRDT canvas + WS relay + ASP.NET gateway)
version: 1.0
date_created: 2026-07-13
last_updated: 2026-07-13
owner: Orbit / NexusWorkspaceEngine
status: 'Planned'
tags: [architecture, local-first, crdt, yjs, nextjs, aspnet, websocket, monorepo]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This plan is the **authoritative execution specification** for Fable 5 and other autonomous agents building the Orbit Workspace Engine. It translates the product blueprint into deterministic, verifiable tasks with explicit file paths, APIs, and validation gates.

**Execution contract:** Complete phases in order. Each phase has a **HARD GATE** — all validation commands must pass before starting the next phase.

Companion file: [`../AGENTS.md`](../AGENTS.md)

---

## 1. Requirements & Constraints

### Functional Requirements

- **REQ-001**: Users can create, drag, resize, and edit text blocks on a canvas entirely offline.
- **REQ-002**: Canvas state persists in IndexedDB and survives browser refresh without network.
- **REQ-003**: Multiple clients in the same workspace see real-time CRDT sync via WebSocket relay.
- **REQ-004**: Gateway enforces RBAC (owner/editor/viewer) before issuing WebSocket connection tickets.
- **REQ-005**: Gateway accepts compressed workspace snapshots and persists to PostgreSQL in batches.
- **REQ-006**: RBAC scopes map to Y.js sub-documents so unauthorized data is never streamed.

### Security Requirements

- **SEC-001**: JWT access tokens for HTTP API; separate short-lived WS tickets (≤5 min TTL).
- **SEC-002**: Relay validates WS ticket signature using shared `JWT_SIGNING_KEY` without DB round-trip.
- **SEC-003**: Snapshot ingestion re-validates workspace membership and write permission.
- **SEC-004**: All DB access uses parameterized queries.

### Constraints

- **CON-001**: Server processes must run within 512MB RAM (target steady-state <256MB each).
- **CON-002**: Relay must remain stateless — no in-memory document accumulation across reconnects.
- **CON-003**: Monorepo managed by pnpm workspaces.
- **CON-004**: No paid-tier-only dependencies required for local dev.
- **CON-005**: TypeScript strict mode everywhere in JS/TS packages.

### Guidelines

- **GUD-001**: Prefer Dapper over EF Core for gateway persistence (lower memory footprint).
- **GUD-002**: Use Zustand selectors to isolate React re-renders during drag operations.
- **GUD-003**: Use binary Y.js updates on the wire; never JSON-diff full documents in relay.
- **GUD-004**: Log structured JSON in server processes (`level`, `msg`, `workspaceId`, `userId`).
- **GUD-005**: Inline comments only for CRDT vs OT trade-offs and RBAC sharding rationale.

### Patterns

- **PAT-001**: **Local-first loop:** `User action → Y.Doc mutation → y-indexeddb persist → Zustand notify → React render`. Network sync is a side effect.
- **PAT-002**: **Ticket flow:** `Client → POST /api/workspaces/{id}/ws-ticket (Bearer JWT) → Gateway RBAC check → signed ticket → Client connects relay ?room={id}&ticket={token}`.
- **PAT-003**: **Snapshot flow:** `Client (debounced 30s) → gzip(Y.encodeStateAsUpdate) → POST /api/workspaces/{id}/snapshots → Background worker → validate → UPSERT PostgreSQL`.
- **PAT-004**: **Room naming:** `orbit:ws:{workspaceId}:{scopeId}` where `scopeId` defaults to `default`.

---

## 2. Implementation Steps

### Implementation Phase 1 — Local-First Core (Frontend)

- **GOAL-001**: Deliver an offline-capable workspace canvas with Y.js + IndexedDB + performant React UI.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Scaffold monorepo: root `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`. Create `apps/web` via `pnpm create next-app@latest` (App Router, TS, Tailwind, ESLint). Add shadcn/ui (`npx shadcn@latest init`). | | |
| TASK-002 | Create `packages/shared-types` with `LayoutBlock`, `WorkspaceMeta`, `WsTicketClaims` types. Export from `src/index.ts`. Add as dependency of `apps/web`. | | |
| TASK-003 | Implement `apps/web/src/lib/yjs/workspace-doc.ts`: factory `createWorkspaceDoc(workspaceId: string): Y.Doc` with `meta` and `blocks` Y.Maps per PAT-001. Include CRDT vs OT comment block per GUD-005. | | |
| TASK-004 | Wire `y-indexeddb` persistence in `apps/web/src/lib/yjs/persistence.ts`: `bindWorkspacePersistence(doc, workspaceId)` using provider name `orbit-{workspaceId}`. | | |
| TASK-005 | Implement `apps/web/src/stores/canvas-store.ts` (Zustand): bridge Y.js → store via `doc.on('update')` with origin filtering. Expose selectors: `useBlock(id)`, `useBlockIds()`, `useBlockPosition(id)`. | | |
| TASK-006 | Implement canvas UI: `apps/web/src/components/canvas/WorkspaceCanvas.tsx`, `BlockRenderer.tsx`, `BlockEditor.tsx`. Grid-based drag (pointer events or `@dnd-kit/core`). Resize handles on selected block. | | |
| TASK-007 | Add workspace page `apps/web/src/app/workspace/[id]/page.tsx` that bootstraps doc, persistence, and canvas. Seed demo block if `blocks` empty. | | |
| TASK-008 | Write vitest tests: `apps/web/src/lib/yjs/workspace-doc.test.ts` (add/update/delete block), `apps/web/src/stores/canvas-store.test.ts` (selector does not re-render unrelated blocks). | | |

**TASK-001 detail:**
```bash
cd NexusWorkspaceEngine
pnpm init
# pnpm-workspace.yaml:
# packages: ['apps/*', 'packages/*', 'services/*']
pnpm create next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**TASK-003 Y.js structure:**
```
doc.getMap('meta')  → { workspaceId, title, version: 1 }
doc.getMap('blocks') → Map<blockId, Y.Map<{id,type,x,y,w,h,content,updatedAt}>>
```

**Phase 1 HARD GATE:**
```bash
pnpm install && pnpm --filter @orbit/web test
pnpm --filter @orbit/web dev
# Manual: open /workspace/demo, add blocks, drag, refresh — state persists offline
```

---

### Implementation Phase 2 — Stateless WebSocket Relay

- **GOAL-002**: Real-time multi-client sync via Node.js relay implementing y-websocket protocol.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | Scaffold `apps/relay`: `package.json` name `@orbit/relay`, deps: fastify, ws, y-websocket, jsonwebtoken, pino. Entry: `src/index.ts`. | | |
| TASK-010 | Create `packages/yjs-protocol`: `validateWsTicket(token, signingKey)`, `parseRoomName(room)`, `buildRoomName(workspaceId, scopeId)`. Share between relay and web. | | |
| TASK-011 | Implement `apps/relay/src/auth.ts`: verify JWT ticket claims `{ sub, workspaceId, scopeId, exp }`. Reject expired/missing. Constant-time compare not required (JWT lib handles). | | |
| TASK-012 | Implement `apps/relay/src/rooms.ts`: in-memory `Map<roomName, Set<WebSocket>>` for connection tracking only — **never store Y.Doc**. Broadcast raw frames to peers. | | |
| TASK-013 | Implement y-websocket handler in `apps/relay/src/yws-handler.ts`: on connection, parse `?room=&ticket=`, auth, join room, forward binary messages. Add 30s heartbeat ping/pong per SEC-002. | | |
| TASK-014 | Implement `apps/relay/src/server.ts`: Fastify HTTP health `GET /health` + WS upgrade on `/orbit`. Graceful shutdown on SIGTERM. | | |
| TASK-015 | Web client sync: `apps/web/src/lib/yjs/sync-provider.ts` — `WebsocketProvider` from `y-websocket` pointed at `RELAY_WS_URL`. Connect only when online; queue offline. | | |
| TASK-016 | Integration test `apps/relay/src/rooms.test.ts`: two mock WS clients exchange message via room. Vitest + `ws` test client. | | |

**Phase 2 HARD GATE:**
```bash
pnpm --filter @orbit/relay dev   # port 1234
pnpm --filter @orbit/web dev
# Open same /workspace/demo in two tabs — drag in one, appears in other <200ms
curl http://localhost:1234/health  # → 200 { "status": "ok" }
```

---

### Implementation Phase 2.5 — Redis Pub/Sub (Multi-Instance)

- **GOAL-003**: Cross-instance broadcast for horizontally scaled relay on Render/Fly.io free tier.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-017 | Add `apps/relay/src/redis-bridge.ts`: subscribe `orbit:pub:{roomName}`, publish incoming WS frames. Use `REDIS_URL` from env. | | |
| TASK-018 | Feature-flag via `RELAY_REDIS_ENABLED=true`. Single-instance dev works with flag false. | | |
| TASK-019 | Integration test with docker-compose Redis: message from instance A reaches client on instance B. | | |

**Phase 2.5 HARD GATE:**
```bash
docker compose up redis -d
RELAY_REDIS_ENABLED=true pnpm --filter @orbit/relay dev &
RELAY_PORT=1235 RELAY_REDIS_ENABLED=true pnpm --filter @orbit/relay dev &
# Client on :1234 and :1235 same room — sync works
```

---

### Implementation Phase 3 — ASP.NET Core Gateway

- **GOAL-004**: Authoritative auth, RBAC, WS ticket issuance, and lazy snapshot persistence.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-020 | Scaffold `services/gateway`: `dotnet new web -n Orbit.Gateway -o services/gateway`. Target `net9.0`. Add packages: `Npgsql`, `Dapper`, `Microsoft.AspNetCore.Authentication.JwtBearer`, `System.IdentityModel.Tokens.Jwt`. | | |
| TASK-021 | Create `services/gateway/Sql/schema.sql`: tables `users`, `workspaces`, `workspace_members` (user_id, workspace_id, role), `workspace_snapshots` (workspace_id, scope_id, payload bytea, created_at). | | |
| TASK-022 | Implement `AuthService`: login stub `POST /api/auth/login` (email/password → JWT) for dev. Production-ready interface `IAuthService`. | | |
| TASK-023 | Implement `WorkspaceAuthorizationService`: `CanRead`, `CanWrite`, `CanAdmin` based on `workspace_members.role`. | | |
| TASK-024 | Implement `POST /api/workspaces/{workspaceId}/ws-ticket`: validate Bearer JWT, RBAC read+, return `{ ticket, expiresAt }` signed with `JWT_SIGNING_KEY`, claims per PAT-002. | | |
| TASK-025 | Implement `SnapshotIngestionService` + `SnapshotWorker` (`IHostedService`): channel-based queue, batch every 5s or 50 items, gzip decompress, validate write permission, `INSERT` snapshot row. | | |
| TASK-026 | Implement `POST /api/workspaces/{workspaceId}/snapshots`: accept `Content-Encoding: gzip` body, enqueue to worker, return `202 Accepted`. | | |
| TASK-027 | Web integration: before WS connect, fetch ticket from gateway. Snapshot debounce in `apps/web/src/lib/yjs/snapshot-uploader.ts` (30s, on `visibilitychange`). | | |
| TASK-028 | xUnit tests: `WsTicketTests`, `RbacTests`, `SnapshotWorkerTests` with Testcontainers PostgreSQL or in-memory SQLite fallback. | | |

**API contracts:**

```
POST /api/auth/login
  Body: { "email": string, "password": string }
  Response 200: { "accessToken": string, "expiresAt": string }

POST /api/workspaces/{workspaceId}/ws-ticket
  Header: Authorization: Bearer {accessToken}
  Response 200: { "ticket": string, "expiresAt": string, "relayUrl": string }
  Response 403: RBAC denied

POST /api/workspaces/{workspaceId}/snapshots
  Header: Authorization: Bearer {accessToken}
          Content-Encoding: gzip
  Body: raw gzip bytes (Y.encodeStateAsUpdate)
  Response 202: { "accepted": true }
```

**Phase 3 HARD GATE:**
```bash
docker compose up postgres -d
dotnet ef database update  # or run schema.sql manually
dotnet test services/gateway
# Manual: login → get ticket → web connects relay → edit → snapshot row in DB
```

---

### Implementation Phase 4 — Docker, Compose, CI/CD

- **GOAL-005**: Containerized deployment within 512MB RAM; automated CI on push.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-029 | `apps/relay/Dockerfile`: multi-stage, `node:22-alpine`, production deps only, `NODE_OPTIONS=--max-old-space-size=256`, expose 1234. | | |
| TASK-030 | `services/gateway/Dockerfile`: multi-stage `mcr.microsoft.com/dotnet/sdk:9.0` → `aspnet:9.0-alpine`, `DOTNET_GCHeapHardLimit=0x10000000` (~256MB). | | |
| TASK-031 | `docker-compose.yml`: services `web`, `relay`, `gateway`, `postgres`, `redis` with healthchecks and env wiring. | | |
| TASK-032 | `.github/workflows/ci.yml`: on push/PR — `pnpm install`, `pnpm test`, `dotnet test`, `docker build` both images. | | |
| TASK-033 | `.github/workflows/deploy.yml`: template jobs for Render/Fly.io deploy (manual secrets). Document in README. | | |
| TASK-034 | `README.md`: architecture diagram, quickstart, env table, resume bullet points from product spec. | | |

**Phase 4 HARD GATE:**
```bash
docker compose build && docker compose up -d
docker compose ps  # all healthy
curl localhost:8080/health  # gateway
curl localhost:1234/health  # relay
```

---

## 3. Alternatives

- **ALT-001**: **Server-driven OT (e.g., ShareDB)** — Rejected: central merge logic increases server CPU and violates CON-001/CON-002.
- **ALT-002**: **Store Y.Doc in Redis** — Rejected: memory cost, violates stateless relay principle.
- **ALT-003**: **EF Core over Dapper** — Acceptable fallback if team prefers migrations; Dapper preferred per GUD-001.
- **ALT-004**: **RxDB full replication** — Deferred: Y.js + IndexedDB sufficient for Phase 1–3; RxDB adds bundle size.

---

## 4. Dependencies

- **DEP-001**: `yjs` + `y-indexeddb` + `y-websocket` — CRDT state and sync.
- **DEP-002**: `zustand` — fine-grained UI subscriptions.
- **DEP-003**: `fastify` + `ws` — HTTP health + WebSocket upgrade.
- **DEP-004**: `jsonwebtoken` / `System.IdentityModel.Tokens.Jwt` — ticket crypto.
- **DEP-005**: `ioredis` or `@upstash/redis` — cross-instance pub/sub (Phase 2.5).
- **DEP-006**: `Npgsql` + `Dapper` — PostgreSQL access.
- **DEP-007**: `next` 15 + `react` 19 + `tailwindcss` 4 + shadcn/ui.
- **DEP-008**: Docker + GitHub Actions — Phase 4 delivery.

---

## 5. Files

### Root & config
- **FILE-001**: `package.json` — workspace scripts (`dev`, `test`, `build`).
- **FILE-002**: `pnpm-workspace.yaml` — monorepo package globs.
- **FILE-003**: `.env.example` — all env vars documented.
- **FILE-004**: `docker-compose.yml` — local full stack.

### Frontend (`apps/web`)
- **FILE-005**: `src/lib/yjs/workspace-doc.ts` — Y.Doc factory and block CRUD helpers.
- **FILE-006**: `src/lib/yjs/persistence.ts` — IndexedDB binding.
- **FILE-007**: `src/lib/yjs/sync-provider.ts` — WebSocket provider wrapper.
- **FILE-008**: `src/lib/yjs/snapshot-uploader.ts` — Gateway snapshot debounce.
- **FILE-009**: `src/stores/canvas-store.ts` — Zustand bridge.
- **FILE-010**: `src/components/canvas/WorkspaceCanvas.tsx` — main canvas.
- **FILE-011**: `src/app/workspace/[id]/page.tsx` — workspace route.

### Relay (`apps/relay`)
- **FILE-012**: `src/index.ts` — process entry.
- **FILE-013**: `src/server.ts` — Fastify + WS upgrade.
- **FILE-014**: `src/yws-handler.ts` — y-websocket protocol.
- **FILE-015**: `src/auth.ts` — ticket validation.
- **FILE-016**: `src/rooms.ts` — connection registry (not document state).
- **FILE-017**: `src/redis-bridge.ts` — pub/sub bridge (Phase 2.5).

### Gateway (`services/gateway`)
- **FILE-018**: `Program.cs` — Minimal API host.
- **FILE-019**: `Services/AuthService.cs` — JWT issuance.
- **FILE-020**: `Services/WorkspaceAuthorizationService.cs` — RBAC.
- **FILE-021**: `Services/SnapshotWorker.cs` — `IHostedService` batch writer.
- **FILE-022**: `Sql/schema.sql` — PostgreSQL DDL.

### Shared packages
- **FILE-023**: `packages/shared-types/src/index.ts` — cross-package types.
- **FILE-024**: `packages/yjs-protocol/src/index.ts` — room + ticket helpers.

### CI/CD
- **FILE-025**: `.github/workflows/ci.yml` — test pipeline.
- **FILE-026**: `apps/relay/Dockerfile` — relay image.
- **FILE-027**: `services/gateway/Dockerfile` — gateway image.

---

## 6. Testing

- **TEST-001**: `workspace-doc.test.ts` — Y.js block CRUD mutations update `blocks` map correctly.
- **TEST-002**: `canvas-store.test.ts` — updating block A does not notify subscribers of block B.
- **TEST-003**: `rooms.test.ts` — relay broadcasts binary frame to second peer in same room.
- **TEST-004**: `auth.test.ts` (relay) — rejects expired/invalid ticket; accepts valid.
- **TEST-005**: `WsTicketTests.cs` — gateway issues ticket with correct claims and TTL.
- **TEST-006**: `RbacTests.cs` — viewer cannot obtain write ticket or post snapshot.
- **TEST-007**: `SnapshotWorkerTests.cs` — batch insert writes row to `workspace_snapshots`.
- **TEST-008**: `redis-bridge.test.ts` — cross-instance message delivery (Phase 2.5).
- **TEST-009**: CI workflow runs TEST-001 through TEST-007 on every PR.

---

## 7. Risks & Assumptions

- **RISK-001**: IndexedDB quota exceeded on large workspaces — mitigate with snapshot pruning and scope sharding (REQ-006).
- **RISK-002**: Free-tier Render/Fly.io idle sleep kills WS — mitigate with client reconnect backoff and user-facing connection status.
- **RISK-003**: Y.js bundle size impacts TTI — mitigate with dynamic import of sync provider (online-only).
- **RISK-004**: JWT key rotation requires coordinated relay+gateway deploy — document rotation runbook in README.
- **ASSUMPTION-001**: Single-region deployment acceptable for MVP.
- **ASSUMPTION-002**: Dev auth uses simple email/password stub; production adds OAuth later.
- **ASSUMPTION-003**: `workspaceId` is UUID; room names are not guessable without ticket.

---

## 8. Related Specifications / Further Reading

- [Y.js documentation](https://docs.yjs.dev/)
- [y-websocket protocol](https://github.com/yjs/y-websocket)
- [y-indexeddb persistence](https://github.com/yjs/y-indexeddb)
- [AGENTS.md](../AGENTS.md) — agent entry point
- [agents.md specification](https://agents.md/)

---

## Appendix A — Fable 5 Session Prompts

Copy one prompt per session. Do not combine phases.

### Session 1 (Phase 1)
```text
You are implementing Orbit Workspace Engine Phase 1.
Read AGENTS.md and plan/architecture-orbit-workspace-engine-1.md fully.
Execute GOAL-001 tasks TASK-001 through TASK-008 in order.
Constraints: CON-001–CON-005, patterns PAT-001, guidelines GUD-002 and GUD-005.
When done, run the Phase 1 HARD GATE commands and report results.
Do not implement relay or gateway code.
```

### Session 2 (Phase 2)
```text
You are implementing Orbit Workspace Engine Phase 2.
Prerequisite: Phase 1 HARD GATE passed.
Execute GOAL-002 tasks TASK-009 through TASK-016.
Relay must be stateless per CON-002. Implement y-websocket protocol and ticket auth per PAT-002.
Run Phase 2 HARD GATE and report results.
```

### Session 3 (Phase 2.5)
```text
You are implementing Orbit Workspace Engine Phase 2.5 (Redis pub/sub).
Execute GOAL-003 tasks TASK-017 through TASK-019.
Feature-flag Redis so local single-instance dev still works.
Run Phase 2.5 HARD GATE.
```

### Session 4 (Phase 3)
```text
You are implementing Orbit Workspace Engine Phase 3 (ASP.NET Core gateway).
Execute GOAL-004 tasks TASK-020 through TASK-028.
Use Dapper per GUD-001. Implement RBAC, WS tickets, and snapshot worker per PAT-002 and PAT-003.
Run Phase 3 HARD GATE.
```

### Session 5 (Phase 4)
```text
You are implementing Orbit Workspace Engine Phase 4 (Docker + CI/CD).
Execute GOAL-005 tasks TASK-029 through TASK-034.
Optimize Docker images for 512MB RAM per CON-001.
Run Phase 4 HARD GATE.
```

---

## Appendix B — `.env.example` Template

```env
# PostgreSQL
DATABASE_URL=postgresql://orbit:orbit@localhost:5432/orbit

# Redis
REDIS_URL=redis://localhost:6379
RELAY_REDIS_ENABLED=false

# Auth (generate: openssl rand -base64 32)
JWT_SIGNING_KEY=CHANGE_ME_32_BYTES_MINIMUM

# Service URLs (local dev)
GATEWAY_URL=http://localhost:8080
RELAY_WS_URL=ws://localhost:1234/orbit
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Relay
RELAY_PORT=1234
RELAY_HOST=0.0.0.0

# Gateway
ASPNETCORE_URLS=http://0.0.0.0:8080
```

---

## Appendix C — Resume Bullet Mapping

When all phases complete, verify these claims are true before adding to resume:

1. **Local-first CRDT canvas** — Y.js + IndexedDB, offline drag/edit, sub-100ms TTI offline.
2. **Dual-service architecture** — Node relay (binary broadcast) + ASP.NET gateway (RBAC + batch persistence).
3. **Free-tier optimization** — Docker images <512MB, relay stateless, zero server-side merge.
