# Cloud Coding Agent — Build Plan

> A cloud-based autonomous software engineering agent (Devin/Cursor-class).
> Four conceptual layers (refined from Harkirat's architecture diagram): **Frontend** (dashboard) · **Backend** (API/WS control plane) · **Agent Swarm** (reasoning loop) · **Sandbox** (execution env, hosted by E2B or Docker).
>
> **Two channels:** control (Frontend → Backend → Swarm → Sandbox) and streaming (Sandbox → Frontend directly: browser stream + code-server editor).
>
> **Sandbox contents:** Browser (Playwright) · Code-server (VS Code in browser) · shell · git.

---

## Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | TypeScript, npm workspaces | One language everywhere; shared types between layers |
| Backend brain | Node.js + Fastify (or Express) | Mature, simple, great WebSocket story |
| Real-time | WebSockets (Socket.IO or `ws`) | Bidirectional streaming of logs/diffs/chat |
| Sandbox | Docker container per session *(E2B = managed alternative, see decision below)* | Strong isolation; cheap to spawn |
| DB | Postgres + Prisma *(decide: start with SQLite for dev speed?)* | Persistent sessions/tasks/PRs |
| Queue | Redis/BullMQ *(start with simple HTTP + polling, upgrade later)* | Brain → sandbox command routing |
| Frontend | React + Vite | Dashboard with chat + terminal + browser stream; embeds code-server for the editor |
| LLM | OpenAI/Anthropic tool-calling API | The agent's "brain" |
| Git | Worktrees inside sandbox | Parallel agents on one repo, near-zero extra storage |

---

## Phase 0 — Foundations ✅ (Session 1)
**Goal:** A clean monorepo that builds, typechecks, and tests — boring but essential.

- [x] `.gitignore`, README
- [x] npm workspaces: `apps/frontend`, `apps/backend`, `apps/sandbox-runner`, `packages/shared`
- [x] Shared TypeScript config, ESLint + Prettier
- [x] `packages/shared`: the **contract** — Task, ToolCall, ToolResult, ChatMessage, and the full WebSocket ClientEvent/ServerEvent unions
- [x] CI (GitHub Actions): typecheck + test on every push
- [ ] `git init` + first commit (left to you — say the word)

**Definition of done: ✅ DONE —** `npm run typecheck` and `npm test` pass from root; all three apps scaffolded and importing from `@cloud-agent/shared`; frontend production build succeeds.

**What we learn:** monorepo structure, workspaces, shared contracts (the API-between-APIs).

---

## Phase 1 — Backend + Agent Swarm (the reasoning loop)
> Split: **Backend** = API + WebSocket control plane (auth, sessions, routing). **Agent Swarm** = the LLM reasoning loop + tool registry. Separate modules in the same repo.
**Goal:** The agent takes a user instruction and runs a loop: *think → call a tool → observe → repeat*.

- [ ] LLM client wrapper (streaming, tool-calling mode)
- [ ] **Agent loop**: system prompt + conversation history + tool definitions → LLM returns a tool call → execute → append result → loop until "done"
- [ ] Tool registry: a typed map of `name → handler` (this is what makes tools pluggable)
- [ ] Task model: `Task { id, status, messages[], toolsCalled[] }` — in-memory first, DB later
- [ ] Fake/stub tools first (`echo`, `sleep`) so the loop is testable before real tools exist

**Definition of done:** a script where I paste "fix the typo in README" and the agent loop visibly reasons, calls stub tools, and completes the task — all logged to the terminal.

**What we learn:** LLM function calling, the agent loop (ReAct-style), tool abstraction, streaming.

---

## Phase 2 — Sandbox Runner (execution environment)
**Goal:** A Docker container that the brain drives from outside — the security boundary of the whole project.

- [ ] Sandbox service with an HTTP API: `POST /shell` (create), `POST /shell/:id/command`, `GET /shell/:id/output`
- [ ] Real PTY-backed terminal (node-pty) so long-running commands stream output
- [ ] File tools over the API: `read_file`, `write_file`, `update_file`, `delete_file`, **`undo`** (snapshot-based)
- [ ] Brain ↔ sandbox integration: replace stub tools with real HTTP calls
- [ ] Sandbox env hardening: no host mount secrets, token injection only per-session (Phase 3)

**Definition of done:** brain tells sandbox "run `npm test`", sandbox streams real output back, brain sees it. A `write_file` + `undo` round-trip works.

**What we learn:** Docker isolation, PTY/terminal emulation, HTTP service design, why the brain must never live inside the sandbox.

---

## Phase 3 — GitHub Integration & Security Model
**Goal:** The user installs a GitHub App; the sandbox gets only a short-lived token.

- [ ] Register GitHub App (permissions: contents RW, PRs RW) → private key on backend
- [ ] OAuth callback endpoint: GitHub hits `/github/callback?installation_id=...` → store installation
- [ ] Token minting: sign JWT with private key → POST to GitHub → receive **1-hour installation token**
- [ ] Token injection: installation token + `GITHUB_TOKEN` env var scoped to the session only
- [ ] **Git worktrees**: sandbox checks out a fresh worktree per session instead of re-cloning

**Definition of done:** user installs the app, backend receives the callback, mints a valid token, and a sandbox session can clone/read a private repo using only that token.

**What we learn:** GitHub App auth (JWT → installation token), why PATs are dangerous, the security-boundary pattern, git worktrees.

---

## Phase 4 — Frontend Real-Time Dashboard
**Goal:** The user sees everything the agent is doing — live.

- [ ] WebSocket gateway on backend: one socket per session, multiplexing events
- [ ] Chat UI (send instruction, stream agent's "thinking" + replies)
- [ ] Live terminal component (xterm.js) fed by sandbox PTY events
- [ ] File diff view (agent's edits shown as diffs in real time)
- [ ] Task status timeline (queued → running → tool call → done)
- [ ] **Editor = embedded code-server**: sandbox runs code-server (VS Code in browser); frontend embeds it via the direct streaming channel. We do NOT build an editor.
- [ ] **Browser stream**: Playwright screenshots/CDP stream directly from sandbox to frontend over the streaming channel

**Definition of done:** from the browser, I type "fix the bug" → I watch the agent think, run commands, edit files — all streaming live into the dashboard.

**What we learn:** WebSocket protocol design, event multiplexing, xterm.js, diff streaming, state synchronization.

---

## Phase 5 — Advanced Toolkit
**Goal:** The agent gets the tools that make it feel like a real engineer.

- [ ] **Browser tool** (Playwright in sandbox): navigate, click, type, screenshot; screenshots stream back to the chat
- [ ] **LSP tool**: hover, go-to-definition, find-references (typescript-language-server in sandbox)
- [ ] **Deploy tool**: write `fly.toml`, run `fly deploy` / vercel, expose port
- [ ] **Human-in-the-loop tool**: agent pauses and asks the user a question; loop resumes on answer

**Definition of done:** agent can start a dev server, open it in the headless browser, screenshot it, and send the image to the chat. And it can pause to ask you for an API key.

**What we learn:** Playwright automation, LSP protocol, deployment automation, async human interaction in an agent loop.

---

## Phase 6 — Concurrency & Scale (worktrees + queue)
**Goal:** Many sessions, same repo, true parallelism.

- [ ] Git worktrees per session (move from single-clone to worktree pool)
- [ ] Redis/BullMQ queue: brain enqueues commands → worker routes to the right sandbox
- [ ] Session manager: spin up / tear down sandboxes, reuse worktrees
- [ ] Collision handling: two agents editing the same file (merge conflicts surface as PR conflicts)

**Definition of done:** two sessions run on the same repo simultaneously — Agent A edits frontend, Agent B fixes a backend bug — no blocking, both complete.

**What we learn:** git internals (worktrees), queue-based routing, backpressure, horizontal scaling.

---

## Phase 7 — SRE Extension (production observability agent)
**Goal:** The agent watches production and fixes bugs autonomously.

- [ ] Webhook receiver for Sentry/Datadog error alerts
- [ ] On alert: agent pulls recent PRs, finds the introducing commit (git bisect-lite)
- [ ] Spins up sandbox, creates revert PR or patch PR automatically

**Definition of done:** a fake Sentry webhook triggers the agent → it identifies the bad commit from a test repo → opens a revert PR with a description.

**What we learn:** webhooks, incident response automation, git bisect, autonomous loop safety.

---

## Cross-cutting (do all along, not at the end)
- Unit tests for every tool and the agent loop
- Error handling: LLM timeouts, sandbox crashes, GitHub rate limits
- Observability: structured logs + request tracing from the start

---

## Sandbox hosting — DECISION (LOCKED — Session 1): Self-hosted Docker
**Chosen: Option A — self-hosted Docker**, because this project is our classroom: PTY shells, container isolation, worktrees, and wiring browser + code-server into a container are exactly the low-level skills we're here to learn. E2B would hand us those for free but we'd learn none of it, and it costs money at scale.

**Option B (backup, noted):** E2B — rent sandboxes from E2B's API with prebuilt browser + code-server templates. Fastest path to a working product, matches Harkirat's course. **Plan:** isolate the sandbox behind an interface either way (Phase 2), so we can swap to E2B later without touching the swarm.

---

## Stack decisions (LOCKED — Session 0)
1. **Frontend: React + Vite** — pure real-time dashboard, no SSR needed; Monaco + xterm.js drop in later.
2. **DB: SQLite + Prisma** — real ORM/schema from day one, zero setup; Postgres swap later is a provider change.
3. **Queue: HTTP polling first** — single sandbox for now; Redis/BullMQ in Phase 6 when real concurrency exists.
4. **LLM: interface + OpenAI first** — one adapter to swap providers; never couple the loop to a vendor.
5. **Real-time: raw `ws`** — build our own small multiplexer; Socket.IO only if we later need reconnection/rooms.

Reference: `docs/END_TO_END_FLOW.md` is the canonical request-flow document.
