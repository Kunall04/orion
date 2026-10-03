# Learning Log

> Everything I learn while building the Cloud Coding Agent, in my own words.
> Rule: never leave a session without appending a few lines here — future-me will thank past-me.

---

## Session 0 — Project kickoff (concepts from the master plan)

### The 3-layer architecture
- **Frontend** = what the user sees (chat, live browser stream, code editor, terminal). Talks to backend over **WebSockets**.
- **Backend = "Agent Brain"** = where the LLM lives and the reasoning loop runs. It NEVER executes user code — it only *orchestrates*.
- **Sandbox** = isolated container/VM where the actual code runs. The brain talks to it over HTTP/queues.

**Key insight:** the brain and the sandbox are separate processes on separate machines. The sandbox is disposable and untrusted; the brain is trusted but never touches user code directly.

### Why GitHub App tokens instead of PATs
- A Personal Access Token (PAT) is long-lived and grants broad access. If the sandbox is compromised, the attacker gets your real credentials.
- Instead: GitHub App → backend holds a **private key** → on each session, it exchanges the key + `installation_id` for a **1-hour installation token** → only that short-lived token goes into the sandbox.
- Even a fully compromised sandbox leaks nothing worse than a token that expires in 60 minutes.

### Git Worktrees
- Cloning a big repo per task is slow and wasteful. **Worktrees** = multiple working directories sharing ONE `.git` database.
- Each worktree checks out its own branch → Agent A edits frontend in worktree A while Agent B fixes backend in worktree B. True parallelism, near-zero extra storage.

### The agent loop (ReAct pattern)
- Not magic — a loop: `LLM thinks → returns a tool call → we execute the tool → append the result to history → LLM thinks again` … until it says "done".
- The LLM is the *decision maker*, the tools are its *hands* (shell, files, browser, LSP).

### The toolkit
shell · files (with **undo**) · Playwright browser · LSP · deploy · **human-in-the-loop** (pause and ask the user).

### Security mental model (the golden rule)
> Never inject long-lived credentials into the sandbox. Give it only what it needs for THIS session, and make that expire fast.

---

### Stack decisions we locked (and why)
- **React + Vite** frontend — it's a real-time dashboard, not a content site; SSR would add complexity for nothing.
- **SQLite + Prisma** — real ORM from day one, zero ops overhead; Postgres later = provider swap.
- **HTTP polling** before Redis — you don't need a queue until you have real concurrency (Phase 6).
- **LLM behind an interface** — the loop depends on an abstraction, not on OpenAI; providers are swappable adapters.
- **Raw `ws` not Socket.IO** — Socket.IO hides framing, heartbeats, and rooms; we build a tiny multiplexer ourselves and learn the protocol.

**Lesson:** decisions that are cheap to reverse (stack details) get made fast and early; decisions that are expensive to reverse (DB, queue shape) get deferred until we've *felt* the pain that justifies them.

### The end-to-end flow (mental model, see docs/END_TO_END_FLOW.md)
- User → WebSocket → backend brain → agent loop → (tool call) → sandbox → events stream back the same way.
- The loop is: `LLM thinks → tool call → execute → append result → repeat until done`.
- The frontend only renders events; the backend only orchestrates; the sandbox only executes. Nobody crosses boundaries.

---

## Session 1 — Harkirat's architecture diagram (the refinement)

### Backend and Agent Swarm are NOT the same thing
- **Backend** = thin control plane: API routes, WebSocket server, auth, sessions. It does no LLM reasoning.
- **Agent Swarm** = where the reasoning loop lives: LLM calls, tool registry, orchestration, DB access.
- Lesson: separate the "web server" from the "brain". They can live in one codebase, but as distinct modules with clear boundaries.

### The two channels
- **Control channel** (small): Frontend → Backend → Swarm → Sandbox. Chat, task status, tool results.
- **Streaming channel** (heavy): Sandbox → Frontend DIRECTLY. Browser stream + editor.
- Lesson: heavy real-time data (video, editor) bypasses the brain. Routing it through the control plane would clog it and add latency. Bandwidth-heavy ≠ control traffic.

### The editor is not custom-built — it's code-server
- Code-server = VS Code running in the browser, hosted INSIDE the sandbox. The frontend just embeds it (iframe/direct connection).
- Lesson: don't rebuild what exists. The "VS Code view" in these products is often literally VS Code, embedded.

### Sandbox contents (Harkirat's answer to his own question)
1. **Browser** (Playwright — the agent's eyes for testing)
2. **Code-server** (VS Code — the editor view)
Plus shell + git for us.

### E2B — a sandbox provider, not a sandbox
- E2B is a managed service that hosts sandboxes with prebuilt templates (browser, code-server).
- Decision for us: self-host Docker (learn the internals) vs E2B (fast, matches course). We isolate the sandbox behind an interface so we can switch.

---

## Session 2 — Phase 0: the monorepo (what we actually built)

### npm workspaces
- Root `package.json` declares `workspaces: ["apps/*", "packages/*"]`. `npm install` from root installs everything once, hoisted to a single root `node_modules`.
- `npm run <script> --workspaces --if-present` runs a script in every workspace that has it — one command, whole repo.
- Each workspace is a real npm package: `@cloud-agent/backend`, `@cloud-agent/shared`, etc.

### The internal-package trick (why shared works with zero build step)
- `packages/shared/package.json` sets `"main": "./src/index.ts"` and `"types": "./src/index.ts"` — the package *is* the source.
- Consumers (`tsc`, `tsx`, Vitest, Vite) all resolve the types straight from the `.ts` file. No `dist/`, no build order, no watch mode.
- Works because our runtime is `tsx` (dev) and Vite/esbuild (frontend) — both transpile TS on the fly. We never emit JS in dev.

### Why the app factory pattern
- `app.ts` exports `buildApp()` (routes only) and `index.ts` binds the port. 
- Tests use `app.inject({ method, url })` — Fastify's in-memory HTTP. No port, no sockets, no flaky test servers.
- This pattern pays off bigger every phase: the swarm can import `buildApp()` directly instead of curling a live server.

### The contract is a discriminated union
- `ServerEvent` is a union of event objects distinguished by a literal `type` field (`'agent.thinking' | 'shell.output' | ...`).
- TypeScript narrows on `event.type === 'shell.output'`, so a switch over types is exhaustively checked. The frontend and backend can't drift apart without a compile error.

### Version choices (why these)
- **Fastify** over Express: built-in schema validation, `inject()` testing, faster. 
- **tsx** over ts-node: zero config, watch mode, esbuild-speed. 
- **Vitest** over Jest: native ESM + TS, shares Vite's transform pipeline, faster.

---

## How we build (our process)
- Plan first (BUILD_PLAN.md), build phase by phase, **definition of done** gates each phase.
- Order by risk: agent loop + sandbox first, pretty UI last.
- Every tool call and the agent loop get tests.
- Log structured, never `console.log` chaos.

---

## Session 3 — Fastify basics (in my own words)

### buildApp() vs index.ts
- `buildApp()` builds the server and its routes but does NOT open a port. `index.ts` calls it and does `listen()`.
- Reason: tests can use the app without starting a real server.

### inject() testing
- `app.inject({ method, url })` pretends a request arrived and runs it through the routes inside the same process. No port, no network, no leftover server. Fast and reliable.
- Express needs the extra `supertest` package to do something similar.

### Schema validation
- Put `schema: { body: {...} }` on a route and Fastify checks the request BEFORE my handler runs. Bad input gets a 400 automatically (the Ajv library does the check).
- It also converts types by default: `instruction: 42` becomes the string "42" and passes. Surprising, so remember it.
- TypeScript types vanish at runtime, so they cannot check incoming JSON. The schema is the runtime check. Types and schema describe the same shape twice, so keep them in sync.

### Async handlers
- `async` handler: just `return` the value and Fastify sends it. No `reply.send` needed, no callbacks.
- Generics: `app.post<{ Body: {...} }>(...)` tells TypeScript what `request.body` is.
