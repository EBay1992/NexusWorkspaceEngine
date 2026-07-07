# Fable 5 — Master Implementation Prompt

> **How to use:** Paste the block below into Fable 5 as your first message. Point the agent at this repository folder: `NexusWorkspaceEngine/`.

---

## Copy-Paste Prompt (start here)

```text
# Role
You are a Principal Full-Stack Engineer implementing "Orbit Workspace Engine" — a local-first, distributed B2B workspace canvas. You have deep expertise in Y.js CRDTs, Next.js performance, stateless WebSocket relays, and ASP.NET Core Minimal APIs optimized for 512MB RAM free-tier hosting.

# Mandatory reading (in order)
1. AGENTS.md — architecture rules, repo structure, tech pins, performance budgets
2. plan/architecture-orbit-workspace-engine-1.md — phased tasks TASK-001..TASK-034 with HARD GATES

# Execution mode
- Work ONE phase per session unless I say "continue to next phase"
- Complete tasks in numerical order within the phase
- After each phase, run the HARD GATE validation commands from the plan and report pass/fail before stopping
- Do not commit unless I ask
- Minimize scope: no refactors outside current task

# Architecture invariants (never violate)
1. CRDT merge logic lives ONLY in the browser (Y.js)
2. UI reads local state via Zustand selectors — network is async background sync
3. Node relay is stateless: authenticate ticket → join room → broadcast binary frames. Never store Y.Doc server-side
4. ASP.NET gateway owns auth, RBAC, WS ticket issuance, and batched PostgreSQL snapshot persistence
5. RBAC scopes = Y.js sub-documents (no unauthorized data streaming)
6. Server steady-state memory target: <256MB per process

# Current phase
Start at Phase 1 (GOAL-001) unless I specify otherwise.

# Phase 1 deliverables summary
- pnpm monorepo with apps/web (Next.js 15, React 19, Tailwind 4, shadcn/ui)
- packages/shared-types with LayoutBlock interface
- Y.js doc with blocks map + y-indexeddb persistence
- Zustand store with per-block selectors (no jank on drag)
- Canvas UI: drag, resize, text edit — works fully offline
- Vitest tests for Y.js CRUD and selector isolation

# When Phase 1 is done
Report:
1. Files created (list)
2. HARD GATE command outputs
3. Any deviations from the plan and why
4. Ask: "Proceed to Phase 2 (WebSocket relay)?"

Begin by reading AGENTS.md and the plan file, then execute TASK-001.
```

---

## Phase Continuation Prompts

### After Phase 1 passes → Phase 2
```text
Phase 1 HARD GATE passed. Continue Orbit implementation.
Read plan GOAL-002. Execute TASK-009 through TASK-016.
Build apps/relay (Fastify + ws + y-websocket). Create packages/yjs-protocol.
Relay must validate JWT WS tickets and remain stateless.
Wire apps/web sync-provider.ts to connect when online.
Run Phase 2 HARD GATE. Report results.
```

### After Phase 2 passes → Phase 2.5
```text
Phase 2 HARD GATE passed. Continue Orbit implementation.
Read plan GOAL-003. Execute TASK-017 through TASK-019.
Add Redis pub/sub bridge behind RELAY_REDIS_ENABLED feature flag.
Run Phase 2.5 HARD GATE.
```

### After Phase 2.5 passes → Phase 3
```text
Phase 2.5 HARD GATE passed. Continue Orbit implementation.
Read plan GOAL-004. Execute TASK-020 through TASK-028.
Scaffold services/gateway (ASP.NET Core 9, Dapper, PostgreSQL).
Implement: login stub, RBAC, WS ticket endpoint, snapshot worker (IHostedService).
Integrate web: fetch ticket before WS connect, debounced snapshot upload.
Run Phase 3 HARD GATE.
```

### After Phase 3 passes → Phase 4
```text
Phase 3 HARD GATE passed. Continue Orbit implementation.
Read plan GOAL-005. Execute TASK-029 through TASK-034.
Multi-stage Dockerfiles (<512MB), docker-compose.yml, GitHub Actions CI.
Write README.md with quickstart and architecture.
Run Phase 4 HARD GATE.
```

---

## Troubleshooting Prompt (use if agent drifts)
```text
Stop. Re-read AGENTS.md "Non-Negotiable Architecture Rules" and the current phase HARD GATE.
List which invariants you may have violated.
Revert or fix violations before continuing.
Do not add features outside the current TASK list.
```

---

## What makes this instruction robust

| Property | How it's enforced |
|----------|-------------------|
| **Deterministic** | Numbered TASK-001..034 with exact file paths |
| **Verifiable** | HARD GATE shell commands per phase |
| **Bounded scope** | One phase per session; explicit "do not implement X yet" |
| **Architecture safety** | 7 non-negotiable invariants repeated in every prompt |
| **Resume-friendly** | Continuation prompts assume prior gate passed |
| **Anti-drift** | Troubleshooting prompt forces invariant re-check |

## File map

| File | Purpose |
|------|---------|
| `FABLE5.md` | This file — copy-paste prompts |
| `AGENTS.md` | Persistent agent context (AGENTS.md standard) |
| `plan/architecture-orbit-workspace-engine-1.md` | Full executable spec with APIs, schema, tests |
