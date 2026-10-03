# End-to-End Flow — One Request, Frontend → Backend → Sandbox → Back

> This is the reference document for the whole build. Every phase maps back to a step here.
> Actors: **Frontend** (dashboard) · **Backend** (agent brain) · **Sandbox** (Docker container) · **LLM API** · **GitHub API**

---

## The happy path: user says "fix the bug in README"

```
 USER                FRONTEND               BACKEND (BRAIN)           SANDBOX               LLM / GITHUB
  │                      │                       │                      │                       │
  │  1. opens dashboard  │                       │                      │                       │
  │─────────────────────▶│                       │                      │                       │
  │                      │  2. WebSocket connect │                      │                       │
  │                      │──────────────────────▶│                      │                       │
  │                      │                       │  3. create session    │                       │
  │                      │                       │  + spawn sandbox      │                       │
  │                      │                       │──────────────────────▶│                       │
  │                      │                       │  (healthcheck OK) ◀───│                       │
  │                      │                       │◀──────────────────────│                       │
  │  4. sends instruction │                       │                      │                       │
  │─────────────────────▶│  5. task.create over WS│                      │                       │
  │                      │──────────────────────▶│                      │                       │
  │                      │                       │  6. start agent loop  │                       │
  │                      │                       │──────────────────────▶│  7. LLM call          │
  │                      │                       │                       │  (system+tools+hist) │
  │                      │                       │                       │◀──────────────────────│
  │                      │                       │                       │  8. tool_call:        │
  │                      │                       │                       │  run_command          │
  │                      │                       │  9. route to sandbox   │◀──────────────────────│
  │                      │                       │  via HTTP (or queue)   │                       │
  │                      │                       │──────────────────────▶│                       │
  │                      │                       │  11. stream stdout ◀───│  10. execute          │
  │                      │                       │      events            │                       │
  │  12. live terminal   │  11b. forward events  │                       │                       │
  │◀─────────────────────│◀──────────────────────│                       │                       │
  │                      │                       │  [loop: 7→11 until     │                       │
  │                      │                       │   the LLM says done]   │                       │
  │                      │                       │                       │                       │
  │                      │                       │  final: task.completed │                       │
  │  13. task status     │◀──────────────────────│                       │                       │
  │◀─────────────────────│                       │  teardown sandbox      │                       │
  │                      │                       │──────────────────────▶│  (container removed)  │
```

---

## Step-by-step (what actually happens, in order)

### 1. Session setup
- User opens the dashboard → frontend opens a **WebSocket** to the backend with a `session.create` handshake.
- Backend creates a `Task` record, spawns a **sandbox container** (Docker), waits for its healthcheck.
- Sandbox gets only what it needs for *this* session: repo access via a **short-lived installation token** (Phase 3), never long-lived credentials.

### 2. Instruction arrives
- User types "fix the bug in README" → frontend sends `task.create` over the WebSocket.
- Backend persists the message, marks the task `running`, and starts the **agent loop**.

### 3. The agent loop (the heart — Phase 1)
```
while true:
    1. Build context: system prompt + tool definitions + conversation history
    2. Call the LLM (tool-calling mode)
    3. If LLM returns TEXT  → stream it to frontend as a chat message
    4. If LLM returns a TOOL CALL → look it up in the tool registry
    5. Execute it (often by calling the sandbox over HTTP)
    6. Append the ToolResult to history
    7. If LLM said "done" → break
```

### 4. Tool execution (the hands — Phase 2)
- `run_command("npm test")` → backend `POST`s to sandbox → sandbox runs it in a **PTY-backed shell** → stdout/stderr chunks stream back as `shell.output` events → backend forwards them to the frontend over WS → the user watches a **live terminal**.
- `read_file` / `write_file` / `update_file` / `delete_file` / `undo` → sandbox filesystem ops; each edit emits a `file.changed` event with a diff, so the frontend can show live diffs.
- `browser.navigate` (Phase 5) → Playwright inside sandbox → screenshots return as events the chat can render as images.

### 5. Human-in-the-loop (Phase 5)
- At any point the agent can emit a `question.asked` event → the loop **pauses** → frontend shows the question → user answers over WS → the answer is appended to history → loop resumes.

### 6. Completion
- The LLM decides the task is done → backend sets `task.completed`, writes the final summary to chat.
- In later phases: creates a **PR** via the GitHub API using the session token (Phase 3+), then tears down the sandbox.

---

## The event contract (what flows over the WebSocket)

| Direction | Event | Payload |
|---|---|---|
| F→B | `session.create` | `{ repoUrl, branch }` |
| F→B | `task.create` | `{ instruction }` |
| F→B | `question.answer` | `{ questionId, answer }` |
| B→F | `agent.thinking` | `{ text }` (streamed chunks) |
| B→F | `agent.message` | `{ role, content }` |
| B→F | `shell.output` | `{ shellId, chunk, stream: stdout\|stderr }` |
| B→F | `file.changed` | `{ path, diff }` |
| B→F | `browser.screenshot` | `{ imageBase64 }` |
| B→F | `question.asked` | `{ questionId, text }` |
| B→F | `task.status` | `{ status: queued\|running\|waiting\|completed\|failed }` |

> These types live in `packages/shared` and are the compile-time contract between all three layers.

---

## The two channels (refined architecture, Harkirat's diagram)

There are TWO paths, and they carry different traffic:

**1. Control channel** (small, important): Frontend → Backend → Agent Swarm → Sandbox
- Chat messages, task status, agent reasoning, tool results.
- This is the WebSocket + HTTP path described above.

**2. Streaming channel** (heavy, real-time): Sandbox → Frontend directly
- The **browser stream** (Playwright screenshots/video) and the **code-server editor** (VS Code in the browser).
- These stream straight from the sandbox to the frontend, bypassing the backend.
- Why: video/editor data is bandwidth-heavy and latency-sensitive. Routing it through the brain would clog the control path and add lag.
- Practically: the sandbox exposes ports (code-server's web UI, the browser's CDP/screenshot endpoint) and the frontend connects to them directly.

**Sandbox contents (Harkirat's answer):** 1. Browser (Playwright) · 2. Code-server (VS Code in browser) — plus our shell and git.

---

## Why the layers are separate (recap of the golden rule)
- The **backend never executes user code** — it only orchestrates.
- The **sandbox never holds real credentials** — only short-lived, per-session tokens.
- The **frontend only renders events** — control flows through the backend; heavy streams come straight from the sandbox.
- Breaking any of these boundaries is a security or architecture violation, not an optimization.
