# Cloud Agent

A cloud-based autonomous software engineering agent (Devin/Cursor-class). User gives a high-level instruction; the agent plans, clones the repo into a sandbox, writes code, tests it in a headless browser, and opens a PR.

## Architecture (4 layers)

- **Frontend** — React + Vite dashboard (chat, live terminal, browser stream, embedded code-server editor)
- **Backend** — Fastify API + WebSocket control plane (auth, sessions, routing)
- **Agent Swarm** — the LLM reasoning loop + tool registry
- **Sandbox** — Docker container (browser, code-server, shell, git) driven externally by the swarm

Two channels: **control** (Frontend → Backend → Swarm → Sandbox) and **streaming** (Sandbox → Frontend directly for browser/editor).

## Docs

- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — phased roadmap with definitions of done
- [`LEARNING_LOG.md`](./LEARNING_LOG.md) — what we learn, session by session
- [`docs/END_TO_END_FLOW.md`](./docs/END_TO_END_FLOW.md) — the canonical request-flow reference

## Workspaces

| Package | Purpose |
|---|---|
| `packages/shared` | The event/task contract all layers compile against |
| `apps/backend` | API + WebSocket control plane |
| `apps/sandbox-runner` | The sandbox service (HTTP API the swarm drives) |
| `apps/frontend` | The dashboard |

## Commands

```bash
npm install        # install all workspaces
npm run typecheck  # tsc across all workspaces
npm test           # vitest across all workspaces
npm run dev:backend
npm run dev:sandbox
npm run dev:frontend
```
