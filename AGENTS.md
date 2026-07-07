# AGENTS.md — Orbit Workspace Engine

> **Audience:** ChatGPT 5.6, Fable 5, Cursor, and other autonomous coding agents.
> **ChatGPT 5.6 entry point:** [`CHATGPT56.md`](CHATGPT56.md)
> **Goal:** Implement a local-first, distributed workspace builder within free-tier cloud constraints (512MB RAM, minimal server CPU).
> **Read this file first.** Then follow `plan/architecture-orbit-workspace-engine-1.md` phase by phase. Do not skip phases.

---

## Project Identity

| Field | Value |
|-------|-------|
| **Name** | Orbit Workspace Engine |
| **Codename** | NexusWorkspaceEngine |
| **Architecture** | Local-first CRDT (Y.js) + stateless WebSocket relay + authoritative ASP.NET Core gateway |
| **Repo layout** | Monorepo (pnpm workspaces) |

---

## Non-Negotiable Architecture Rules

1. **Client owns merge logic.** All CRDT conflict resolution happens in the browser via Y.js. Servers never merge document state.
2. **UI reads local state only.** React components subscribe to Zustand selectors backed by Y.js. Network sync is async and must not block interaction.
3. **WebSocket relay is stateless.** It authenticates a short-lived ticket, joins a room, and broadcasts binary Y.js updates. No document storage in Node.
4. **ASP.NET Core is authoritative for identity, RBAC, and persistence.** It issues WS tickets and accepts batched compressed snapshots on a background path.
5. **RBAC scopes = Y.js sub-documents.** Partition workspace data by permission scope so clients never receive unauthorized shards.
6. **512MB RAM budget.** Every server process must target <256MB steady-state; leave headroom for spikes.
7. **No secrets in git.** Use `.env.example` only; real secrets via environment variables.

---

## Repository Structure (create exactly this)

```
NexusWorkspaceEngine/
├── AGENTS.md                          # This file
├── README.md                          # Human-facing overview
├── package.json                       # pnpm workspace root
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
├── docker-compose.yml                 # Local dev: postgres, redis, all services
├── plan/
│   └── architecture-orbit-workspace-engine-1.md
├── apps/
│   ├── web/                           # Next.js 15 App Router
│   └── relay/                         # Node.js Fastify + ws + y-websocket
├── services/
│   └── gateway/                       # ASP.NET Core 9 Minimal API
├── packages/
│   ├── shared-types/                  # TS types shared web ↔ relay
│   └── yjs-protocol/                  # Room naming, ticket validation helpers
└── .github/
    └── workflows/
        ├── ci.yml
        └── deploy.yml
```

---

## Technology Pin List

Use these exact major versions unless a security patch requires bumping:

| Layer | Package / Runtime | Version |
|-------|-------------------|---------|
| Runtime (Node) | Node.js | 22 LTS |
| Runtime (.NET) | .NET SDK | 9.0 |
| Frontend | Next.js | 15.x |
| UI | React | 19.x |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui | latest compatible with React 19 |
| State (UI) | zustand | 5.x |
| CRDT | yjs | 13.x |
| Persistence | y-indexeddb | 9.x |
| Sync client | y-websocket | 2.x |
| Relay server | fastify | 5.x |
| WS | ws | 8.x |
| Redis pub/sub | @upstash/redis or ioredis | latest |
| API | ASP.NET Core | 9.0 |
| ORM choice | Dapper (preferred) or EF Core 9 | — |
| DB | PostgreSQL | 16 |
| Cache | Redis | 7 |
| Auth | JWT (System.IdentityModel.Tokens.Jwt) | — |
| Tests (TS) | vitest | 3.x |
| Tests (C#) | xUnit | latest |

---

## Setup Commands

```bash
# Prerequisites: Node 22, pnpm 9+, .NET 9 SDK, Docker

cd NexusWorkspaceEngine
pnpm install
cp .env.example .env

# Start infra + all services locally
docker compose up -d
pnpm dev                    # Starts web + relay via turbo/pnpm scripts

# Individual targets
pnpm --filter @orbit/web dev
pnpm --filter @orbit/relay dev
dotnet run --project services/gateway
```

---

## Development Workflow

### Phase order (strict)

| Phase | Scope | Gate before next phase |
|-------|-------|------------------------|
| **P1** | Local-first frontend (offline canvas) | Drag/resize/type works offline; persists across refresh |
| **P2** | WebSocket relay | Two browser tabs sync in real time |
| **P2.5** | Redis pub/sub (optional multi-instance) | Cross-instance broadcast verified |
| **P3** | ASP.NET gateway (auth, RBAC, snapshots) | Ticket issuance + DB persistence works |
| **P4** | Docker + CI/CD | `docker compose up` and CI green |

### Agent execution rules

1. **One phase per session** unless the user explicitly asks to continue.
2. **Read before write:** Inspect existing files; match naming and patterns.
3. **Minimal diff:** Do not refactor unrelated code.
4. **Verify each task:** Run the validation command in the plan before marking complete.
5. **Commit style:** `feat(web): ...`, `feat(relay): ...`, `feat(gateway): ...`, `chore(ci): ...`
6. **Do not commit** unless the user asks.
7. **Comments:** Only for non-obvious CRDT/RBAC/sync trade-offs (see plan PAT-001).

---

## Domain Model

### LayoutBlock (canonical shape)

```typescript
interface LayoutBlock {
  id: string;           // uuid v4
  type: 'text' | 'note' | 'embed';
  x: number;            // grid units, integer
  y: number;
  w: number;            // min 1
  h: number;            // min 1
  content: string;      // plain text or JSON string for embeds
  updatedAt: number;    // epoch ms, client-set
}
```

### Y.js document layout

```
Y.Doc (workspace root)
├── Y.Map('meta')           → { workspaceId, title, version }
├── Y.Map('blocks')         → blockId → Y.Map(block fields)  [default scope: all members]
└── Y.Map('scopes')         → scopeId → Y.Doc subdocument    [RBAC shards, Phase 3+]
```

### RBAC roles (gateway)

| Role | Permissions |
|------|-------------|
| `owner` | read, write, admin, invite |
| `editor` | read, write |
| `viewer` | read |

---

## Performance Budgets

| Metric | Target | How to verify |
|--------|--------|---------------|
| TTI (offline load) | < 100ms to interactive canvas | Lighthouse / manual |
| Drag frame budget | 60fps, no >16ms React commit | React Profiler |
| Y.js update → UI | < 8ms median | `performance.now()` in dev hook |
| Relay memory | < 128MB at 50 connections | `process.memoryUsage()` |
| Gateway memory | < 200MB under load | `dotnet-counters` |

---

## Code Style

### TypeScript (apps/web, apps/relay, packages/*)

- Strict TypeScript (`"strict": true`).
- Prefer named exports; default export only for Next.js pages/layouts.
- File naming: `kebab-case.ts`, React components `PascalCase.tsx`.
- Hooks: `use-<domain>.ts` in `apps/web/src/hooks/`.
- No `any`; use `unknown` + narrowing.
- Zustand: always use selectors — never `useStore()` without selector.

### C# (services/gateway)

- Minimal APIs in `Program.cs` or `Endpoints/` folder.
- `IHostedService` for snapshot worker.
- Structured logging via `ILogger<T>`.
- Async all the way; no `.Result` / `.Wait()`.

---

## Testing Instructions

```bash
# TypeScript unit + integration
pnpm test

# C# unit tests
dotnet test services/gateway

# E2E (Phase 1 gate): manual — open two tabs, verify sync (Phase 2+)
pnpm --filter @orbit/web test:e2e   # add Playwright in Phase 4
```

### Required test coverage by phase

| Phase | Minimum tests |
|-------|---------------|
| P1 | Y.js block CRUD unit tests; Zustand selector isolation test |
| P2 | Relay room join + broadcast integration test |
| P3 | JWT ticket issue/validate; RBAC filter; snapshot batch insert |
| P4 | CI runs all above on every push |

---

## Security Checklist

- [ ] JWT signing key ≥ 256 bits, from env only
- [ ] WS tickets expire ≤ 5 minutes
- [ ] Relay rejects connections without valid ticket
- [ ] RBAC checked before ticket issue AND before snapshot accept
- [ ] Snapshot endpoint rate-limited
- [ ] PostgreSQL uses parameterized queries (Dapper/EF)
- [ ] CORS restricted to known web origin

---

## Environment Variables

See `.env.example`. Agents must create this file with placeholders:

| Variable | Used by | Description |
|----------|---------|-------------|
| `DATABASE_URL` | gateway | PostgreSQL connection string |
| `REDIS_URL` | relay, gateway | Redis / Upstash URL |
| `JWT_SIGNING_KEY` | gateway, relay | Shared secret for ticket validation |
| `GATEWAY_URL` | web | ASP.NET API base URL |
| `RELAY_WS_URL` | web | ws:// or wss:// relay URL |
| `NEXT_PUBLIC_APP_URL` | web | Browser origin |

---

## Common Failure Modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| UI jank on drag | Zustand store too wide | Narrow selector per block |
| Sync loop | Provider applied own update | Use `Y.applyUpdate` with origin check |
| Relay OOM | Holding room state | Ensure stateless broadcast only |
| Ticket rejected | Clock skew / expiry | Sync NTP; shorten client retry |
| IndexedDB quota | Large snapshots | Compress; prune history in Phase 3 |

---

## Pull Request Guidelines

- Title: `feat(<scope>): <imperative summary>`
- Each PR = one phase or one logical task group from the plan
- Must pass `pnpm test` and `dotnet test`
- Include brief test plan in PR description

---

## Primary Reference

**Full executable plan:** [`plan/architecture-orbit-workspace-engine-1.md`](plan/architecture-orbit-workspace-engine-1.md)

Start with **GOAL-001 / Phase 1**. Do not implement relay or gateway until Phase 1 validation passes.
