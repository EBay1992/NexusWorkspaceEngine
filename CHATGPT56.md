# ChatGPT 5.6 — Master Implementation Prompt

> **How to use with ChatGPT 5.6**
>
> **Option A — ChatGPT with repo / Codex:** Open `NexusWorkspaceEngine/` as the project. Paste the Master Prompt below. Tell it to read `AGENTS.md` and `plan/architecture-orbit-workspace-engine-1.md`.
>
> **Option B — ChatGPT without file access:** Upload both files above **plus** this file. Paste the Master Prompt. The prompt includes inlined essentials so it still works if uploads are partial.
>
> **Option C — Long-running build:** Use one ChatGPT conversation per phase. Start a **new chat** for each phase if context gets long; paste the relevant Phase Continuation Prompt **and** a short "state handoff" (see Appendix).

---

## Copy-Paste Prompt (start here)

```text
# Role
You are a Principal Full-Stack Engineer implementing **Orbit Workspace Engine** — a local-first, distributed B2B workspace canvas optimized for free-tier cloud hosting (512MB RAM).

Expertise required: Y.js CRDTs, Next.js App Router performance, Zustand selector patterns, stateless WebSocket relays (Fastify + ws + y-websocket), ASP.NET Core 9 Minimal APIs, Dapper + PostgreSQL.

# Project location
Repository folder: `NexusWorkspaceEngine/` (monorepo, pnpm workspaces).

If you have file access, read in order:
1. `AGENTS.md`
2. `plan/architecture-orbit-workspace-engine-1.md`

If you do NOT have file access, treat the **Inlined Spec** section at the bottom of this message as authoritative.

# What we are building (one sentence)
A browser-first workspace canvas where Y.js + IndexedDB own all state and merge logic; a stateless Node relay only broadcasts binary CRDT frames; an ASP.NET Core gateway handles JWT auth, RBAC, WS tickets, and batched PostgreSQL snapshots.

# Architecture invariants — NEVER violate
1. CRDT merge logic lives ONLY in the browser (Y.js). Servers never merge documents.
2. UI reads local state via Zustand selectors. Network sync is async background only — never block drag/type on network.
3. Node relay is stateless: validate WS ticket → join room → broadcast binary frames. Never store Y.Doc or accumulated state server-side.
4. ASP.NET gateway is authoritative for identity, RBAC, WS ticket issuance, and lazy snapshot persistence.
5. RBAC scopes map to Y.js sub-documents — clients must not receive unauthorized shards.
6. Each server process targets <256MB steady-state RAM (512MB hard ceiling).
7. No secrets in git. Use `.env.example` placeholders only.

# Repo structure to create
```
NexusWorkspaceEngine/
├── apps/web/              # Next.js 15, React 19, Tailwind 4, shadcn/ui
├── apps/relay/            # Fastify + ws + y-websocket
├── services/gateway/      # ASP.NET Core 9 Minimal API
├── packages/shared-types/ # LayoutBlock, WorkspaceMeta, WsTicketClaims
├── packages/yjs-protocol/ # room names, ticket validation helpers
├── plan/
├── docker-compose.yml
└── .github/workflows/
```

# Technology pins
Node 22 | .NET 9 | Next.js 15 | React 19 | Tailwind 4 | yjs 13 | y-indexeddb 9 | y-websocket 2 | zustand 5 | fastify 5 | ws 8 | Dapper + Npgsql | PostgreSQL 16 | Redis 7 | vitest 3 | xUnit

# Execution rules
1. Work **ONE phase per response cycle** unless I say "continue to next phase".
2. Complete tasks in **numerical order** within the phase (TASK-001, TASK-002, …).
3. After each phase, run the **HARD GATE** commands and report pass/fail with command output.
4. **Do not commit** unless I explicitly ask.
5. **Minimal diff** — no refactors, no extra features outside the current TASK.
6. When writing code, output **complete files** (not partial snippets) unless the file is huge (>200 lines); then show the changed sections clearly.
7. Before coding, briefly list which TASK IDs you will complete in this turn.
8. After coding, list files created/modified and what remains in the phase.

# Current phase
**Phase 1 — GOAL-001** (Local-first frontend, fully offline canvas)

## Phase 1 tasks (execute TASK-001 → TASK-008)
| ID | Task |
|----|------|
| TASK-001 | Scaffold pnpm monorepo + `apps/web` (Next.js 15 App Router, TS, Tailwind, ESLint, shadcn/ui) |
| TASK-002 | `packages/shared-types` — `LayoutBlock`, `WorkspaceMeta`, `WsTicketClaims` |
| TASK-003 | `apps/web/src/lib/yjs/workspace-doc.ts` — Y.Doc factory, `meta` + `blocks` Y.Maps |
| TASK-004 | `apps/web/src/lib/yjs/persistence.ts` — y-indexeddb binding |
| TASK-005 | `apps/web/src/stores/canvas-store.ts` — Zustand + per-block selectors |
| TASK-006 | Canvas UI — drag, resize, text edit (`WorkspaceCanvas`, `BlockRenderer`, `BlockEditor`) |
| TASK-007 | `apps/web/src/app/workspace/[id]/page.tsx` — bootstrap doc + canvas |
| TASK-008 | Vitest tests — Y.js CRUD + selector isolation |

## LayoutBlock shape
```typescript
interface LayoutBlock {
  id: string;
  type: 'text' | 'note' | 'embed';
  x: number; y: number; w: number; h: number;
  content: string;
  updatedAt: number;
}
```

## Y.js document shape
```
Y.Doc
├── Y.Map('meta')    → { workspaceId, title, version }
└── Y.Map('blocks')  → blockId → Y.Map({ id, type, x, y, w, h, content, updatedAt })
```

## Phase 1 HARD GATE (must pass before Phase 2)
```bash
pnpm install && pnpm --filter @orbit/web test
pnpm --filter @orbit/web dev
# Manual: open /workspace/demo → add blocks → drag → refresh → state persists offline
```

# Phase 1 completion report format
When done, respond with:
1. **Files created** (bulleted list with paths)
2. **HARD GATE results** (command output or what to run if you cannot execute)
3. **Deviations** from plan (if any) and why
4. **Question:** "Proceed to Phase 2 (WebSocket relay)?"

# Do NOT implement yet
- WebSocket relay (Phase 2)
- Redis pub/sub (Phase 2.5)
- ASP.NET gateway (Phase 3)
- Docker / CI (Phase 4)

Begin now: confirm you understand the invariants, then execute TASK-001.
```

---

## Phase Continuation Prompts

### Phase 2 — WebSocket Relay (after Phase 1 HARD GATE passes)

```text
Orbit Workspace Engine — Phase 2.

Prerequisite: Phase 1 HARD GATE passed (offline canvas + IndexedDB + tests green).

Execute TASK-009 through TASK-016 in order:
- Scaffold `apps/relay` (Fastify, ws, y-websocket, jsonwebtoken, pino)
- Create `packages/yjs-protocol` (validateWsTicket, parseRoomName, buildRoomName)
- Implement stateless relay: auth ticket → join room → broadcast binary only
- Add 30s heartbeat ping/pong
- Wire `apps/web/src/lib/yjs/sync-provider.ts` (y-websocket, offline queue)
- Vitest integration test for room broadcast

Invariants: relay is stateless (CON-002). Never store Y.Doc server-side.

HARD GATE:
```bash
pnpm --filter @orbit/relay dev
pnpm --filter @orbit/web dev
# Two tabs on /workspace/demo — drag in one, appears in other <200ms
curl http://localhost:1234/health
```

Report: files changed, HARD GATE results, ask to proceed to Phase 2.5.
```

### Phase 2.5 — Redis Pub/Sub

```text
Orbit — Phase 2.5 (Redis pub/sub for multi-instance relay).

Execute TASK-017 through TASK-019:
- `apps/relay/src/redis-bridge.ts` — pub/sub on `orbit:pub:{roomName}`
- Feature flag `RELAY_REDIS_ENABLED` (default false for local dev)
- Integration test with docker Redis

HARD GATE: two relay instances on different ports, same room, sync works.

Report results. Ask to proceed to Phase 3.
```

### Phase 3 — ASP.NET Core Gateway

```text
Orbit — Phase 3 (authoritative gateway).

Execute TASK-020 through TASK-028:
- Scaffold `services/gateway` (.NET 9, Dapper, Npgsql, JWT)
- SQL schema: users, workspaces, workspace_members, workspace_snapshots
- POST /api/auth/login (dev stub)
- POST /api/workspaces/{id}/ws-ticket (RBAC → signed ticket, ≤5min TTL)
- SnapshotWorker (IHostedService) — batch gzip snapshots → PostgreSQL
- POST /api/workspaces/{id}/snapshots → 202 Accepted
- Web: fetch ticket before WS connect; debounced snapshot upload (30s)
- xUnit: WsTicketTests, RbacTests, SnapshotWorkerTests

HARD GATE:
```bash
docker compose up postgres -d
dotnet test services/gateway
# Manual: login → ticket → WS connect → edit → snapshot row in DB
```

Report results. Ask to proceed to Phase 4.
```

### Phase 4 — Docker + CI/CD

```text
Orbit — Phase 4 (deployment).

Execute TASK-029 through TASK-034:
- Multi-stage Dockerfiles (relay + gateway, <512MB, NODE_OPTIONS / GC heap limits)
- docker-compose.yml (web, relay, gateway, postgres, redis)
- .github/workflows/ci.yml (pnpm test + dotnet test + docker build)
- deploy.yml template for Render/Fly.io
- README.md quickstart + architecture

HARD GATE:
```bash
docker compose build && docker compose up -d
docker compose ps  # all healthy
```

Report final file tree and all phase gate status.
```

---

## Troubleshooting Prompt

```text
STOP. Orbit implementation drift detected.

1. Re-state the 7 architecture invariants from memory.
2. List which invariant(s) the last changes may have violated.
3. Identify the current phase and HARD GATE from the plan.
4. Propose a minimal fix — no new features.
5. Do not continue until I confirm.

Current phase: [I will fill in]
```

---

## State Handoff Template (new chat / long sessions)

When starting a fresh ChatGPT conversation mid-project, paste this filled in:

```text
# Orbit handoff
- **Completed phases:** Phase 1 ✅ | Phase 2 ⬜ | Phase 2.5 ⬜ | Phase 3 ⬜ | Phase 4 ⬜
- **Last passing HARD GATE:** [e.g. Phase 1 — pnpm test green, offline persist verified]
- **Current task:** TASK-00X
- **Known issues:** [none / list]
- **Deviations from plan:** [none / list]

Continue from TASK-00X. Read AGENTS.md and plan/architecture-orbit-workspace-engine-1.md if available.
```

---

## ChatGPT 5.6 — Behavioral Tuning

These instructions are tuned for how ChatGPT 5.6 tends to work best:

| Behavior | Instruction |
|----------|-------------|
| **Verbose explanations** | Keep architecture commentary to ≤5 lines per turn; prioritize code and file paths |
| **Scope creep** | Explicit "Do NOT implement yet" list in every phase prompt |
| **Partial files** | Require complete files for new modules; diffs only for edits |
| **Hallucinated APIs** | Pin versions in prompt; verify against official docs if unsure |
| **Lost context** | One phase per chat; use State Handoff Template between chats |
| **No terminal** | Still output exact HARD GATE commands for the user to run; interpret results when pasted back |
| **Over-abstraction** | "Minimal diff — no refactors" repeated in every prompt |

### Recommended ChatGPT settings
- **Mode:** Use coding / agent mode if available (Codex, Advanced Data Analysis with filesystem, or ChatGPT Projects with repo attached).
- **Temperature:** Default is fine; if outputs vary too much, ask "follow the plan literally, no creative additions."
- **Uploads:** Attach `AGENTS.md` + `plan/architecture-orbit-workspace-engine-1.md` at the start of each new phase chat.

---

## Inlined Spec (for uploads-free sessions)

If ChatGPT cannot read repo files, the full plan lives at:
`plan/architecture-orbit-workspace-engine-1.md`

**34 tasks across 5 phases:**

| Phase | GOAL | Tasks | Key deliverable |
|-------|------|-------|-----------------|
| 1 | GOAL-001 | TASK-001–008 | Offline Y.js canvas |
| 2 | GOAL-002 | TASK-009–016 | Stateless WS relay |
| 2.5 | GOAL-003 | TASK-017–019 | Redis pub/sub |
| 3 | GOAL-004 | TASK-020–028 | ASP.NET gateway + RBAC |
| 4 | GOAL-005 | TASK-029–034 | Docker + CI |

**Ticket flow (Phase 3+):**
`Client → POST /api/workspaces/{id}/ws-ticket (Bearer JWT) → RBAC check → signed ticket → ws://relay/orbit?room=orbit:ws:{workspaceId}:{scopeId}&ticket={token}`

**Snapshot flow (Phase 3+):**
`Client (30s debounce) → gzip(Y.encodeStateAsUpdate) → POST /api/workspaces/{id}/snapshots → SnapshotWorker → PostgreSQL`

**RBAC roles:** owner (read, write, admin, invite) | editor (read, write) | viewer (read)

**Env vars:** `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_KEY`, `GATEWAY_URL`, `RELAY_WS_URL`, `NEXT_PUBLIC_APP_URL`, `RELAY_REDIS_ENABLED`

---

## File map

| File | Purpose |
|------|---------|
| `CHATGPT56.md` | This file — ChatGPT 5.6 prompts |
| `FABLE5.md` | Cursor / Fable 5 prompts |
| `AGENTS.md` | Shared agent context |
| `plan/architecture-orbit-workspace-engine-1.md` | Full executable spec |
