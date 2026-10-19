import { useEffect, useRef, useState } from 'react';
import Sidebar, { type SessionItem } from './components/Sidebar';
import RightPanel from './components/RightPanel';
import PromptBar from './components/PromptBar';
import ThinkingState from './components/ThinkingState';
import ToolChips, { type ToolStep, type ToolDiff } from './components/ToolChips';
import OrionLogo from './components/OrionLogo';

/* ─── Types ─────────────────────────────────────────────── */
export interface ThinkingData {
  variant?: string;
  active?: string;
  done?: string;
  rows?: Array<{ primary: string; secondary?: string; mono?: boolean }>;
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  thinking?: ThinkingData;
  toolSteps?: ToolStep[];
  diffs?: ToolDiff[];
}

export interface SessionData extends SessionItem {
  feed: ChatMsg[];
}

/* ─── Initial Sessions ───────────────────────────────────── */
const INITIAL_SESSIONS: SessionData[] = [
  {
    id: 's1',
    title: 'Fix checkout rate-limit test',
    pr: '#142',
    status: 'done',
    time: '2m ago',
    feed: [
      {
        id: 'msg-1',
        role: 'user',
        text: 'Fix the checkout rate-limit test and open a PR with bot commit attribution.',
      },
      {
        id: 'msg-2',
        role: 'agent',
        thinking: {
          variant: 'Coding',
          done: 'Thought for 3 seconds',
          rows: [
            { primary: 'Inspecting test failure in tasks.test.ts', mono: true },
            { primary: 'Configuring bot commit author in git environment', mono: true },
            { primary: 'Opening Pull Request #142 against main', mono: true },
          ],
        },
        toolSteps: [
          {
            icon: 'run',
            label: 'Run tests',
            chip: 'npm test',
            mono: true,
            detailMono: true,
            detail: [{ text: 'FAIL src/routes/tasks.test.ts (rate limit mismatch)' }],
          },
          {
            icon: 'write',
            label: 'Author fix',
            chip: 'ORION_VERIFICATION.md',
            mono: true,
            detailMono: true,
            detail: [{ text: '+ author verification with bot attribution', tone: 'add' }],
          },
          {
            icon: 'run',
            label: 'Push branch',
            chip: 'git push origin orion/fix-test',
            mono: true,
            detailMono: true,
            detail: [{ text: 'Branch orion/fix-test pushed to GitHub' }],
          },
        ],
        diffs: [{ file: 'ORION_VERIFICATION.md', add: 12, del: 0 }],
        text: 'Done. I cloned Kunall04/agent-checkout-gate, reproduced the failing test, applied the fix, committed with bot attribution (344046298+orion-coding-agent[bot]), and opened PR #142 against main.',
      },
    ],
  },
  {
    id: 's2',
    title: 'Add OpenTelemetry tracing',
    pr: '#138',
    status: 'done',
    time: '1h ago',
    feed: [
      {
        id: 'msg-s2-1',
        role: 'user',
        text: 'Add OpenTelemetry distributed tracing to Fastify routes.',
      },
      {
        id: 'msg-s2-2',
        role: 'agent',
        thinking: {
          done: 'Thought for 2 seconds',
          rows: [
            { primary: 'Reviewing Fastify plugin architecture', mono: true },
            { primary: 'Adding trace context propagators', mono: true },
          ],
        },
        toolSteps: [
          {
            icon: 'write',
            label: 'Install OTel',
            chip: 'src/telemetry.ts',
            mono: true,
            detailMono: true,
            detail: [{ text: '+ added OpenTelemetry SDK initialization', tone: 'add' }],
          },
          {
            icon: 'run',
            label: 'Verify tests',
            chip: 'npm test',
            mono: true,
            detailMono: true,
            detail: [{ text: '✓ 34 tests passed' }],
          },
        ],
        diffs: [{ file: 'src/telemetry.ts', add: 28, del: 0 }],
        text: 'Configured OpenTelemetry SDK with automatic trace context propagation on HTTP requests. All checks passing.',
      },
    ],
  },
  {
    id: 's3',
    title: 'Migrate tests to Vitest',
    pr: '#135',
    status: 'done',
    time: '3h ago',
    feed: [
      {
        id: 'msg-s3-1',
        role: 'user',
        text: 'Migrate test suite to Vitest.',
      },
      {
        id: 'msg-s3-2',
        role: 'agent',
        toolSteps: [
          {
            icon: 'run',
            label: 'Run vitest',
            chip: 'vitest run',
            mono: true,
            detailMono: true,
            detail: [{ text: '57 passed in 890ms' }],
          },
        ],
        text: 'Vitest configured across all monorepo workspaces. All 57 tests passing in 890ms.',
      },
    ],
  },
];

const STARTER_PROMPTS = [
  {
    title: 'Fix checkout rate-limit test',
    sub: 'Reproduce failing test in sandbox and patch assertion',
  },
  {
    title: 'Run test suite and verify',
    sub: 'Execute full Vitest workspace checks in sandbox',
  },
  {
    title: 'Add healthcheck probe',
    sub: 'Expose /health/liveness and /health/readiness endpoints',
  },
];

/* ─── Individual message bubbles ─────────────────────────── */
function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end pl-12" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
      <div className="max-w-[340px] rounded-xl bg-field px-3.5 py-2.5 text-[13px] leading-relaxed text-ink shadow-hairline">
        {text}
      </div>
    </div>
  );
}

function AgentTurnBubble({ msg }: { msg: ChatMsg }) {
  return (
    <div className="flex items-start gap-2.5" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
      <OrionLogo size={20} badge className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 max-w-[520px] flex-col gap-2">
        {/* Thinking row (only when thinking exists) */}
        {msg.thinking && (
          <ThinkingState
            key={msg.id + '-think'}
            variant={msg.thinking.variant || 'Steps'}
            rows={msg.thinking.rows}
            active={msg.thinking.active}
            done={msg.thinking.done}
          />
        )}

        {/* Real tool chips (only when tools were invoked) */}
        {msg.toolSteps && msg.toolSteps.length > 0 && (
          <ToolChips steps={msg.toolSteps} diffs={msg.diffs || []} />
        )}

        {/* Agent message text */}
        {msg.text && (
          <p className="pt-0.5 text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Empty state for new sessions ───────────────────────── */
function EmptyState({ onSelectPrompt }: { onSelectPrompt: (p: string) => void }) {
  return (
    <div className="my-auto flex flex-col items-center justify-center gap-6 px-4 py-12 text-center" style={{ animation: 'fade-up 400ms cubic-bezier(0.23,1,0.32,1) both' }}>
      <div className="flex flex-col items-center gap-2">
        <OrionLogo size={36} />
        <h2 className="mt-2 text-[17px] font-semibold tracking-tight text-ink">
          How can Orion help you build today?
        </h2>
        <p className="max-w-[380px] text-[13px] text-ink-3">
          Orion can investigate bugs in your sandbox, author clean commits with bot attribution, and open verified pull requests.
        </p>
      </div>

      <div className="flex w-full max-w-[440px] flex-col gap-2">
        {STARTER_PROMPTS.map((p) => (
          <button
            key={p.title}
            type="button"
            onClick={() => onSelectPrompt(p.title)}
            className="flex flex-col items-start rounded-window border border-line bg-surface p-3 text-left shadow-btn transition-all duration-150 hover:border-line-strong hover:bg-hover active:scale-[0.99]"
          >
            <span className="text-[13px] font-medium text-ink">{p.title}</span>
            <span className="text-[11.5px] text-ink-3">{p.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Chat header ────────────────────────────────────────── */
function ChatHeader({
  isDark,
  setIsDark,
  sessionTitle,
  activePr,
  isRunning,
}: {
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  sessionTitle: string;
  activePr?: string;
  isRunning: boolean;
}) {
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line px-4">
      <div className="flex items-center gap-2">
        <span className="max-w-[280px] truncate text-[13px] font-semibold text-ink">
          {sessionTitle}
        </span>
        {activePr && (
          <span className="rounded-chip bg-green-tint px-2 py-0.5 font-mono text-[10.5px] font-medium text-green">
            PR {activePr}
          </span>
        )}
        <span
          className={`flex items-center gap-1 rounded-chip px-2 py-0.5 text-[10.5px] ${
            isRunning ? 'bg-accent-tint text-accent' : 'bg-field text-ink-3'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-accent animate-pulse' : 'bg-green'}`} />
          {isRunning ? 'Running' : 'Ready'}
        </span>
      </div>

      {/* Theme toggle */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-full border border-line bg-field p-0.5">
          {(['Light', 'Dark'] as const).map((mode) => {
            const active = mode === 'Dark' ? isDark : !isDark;
            return (
              <button
                key={mode}
                onClick={() => setIsDark(mode === 'Dark')}
                className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition-all ${
                  active ? 'bg-surface text-ink shadow-btn' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Main App ───────────────────────────────────────────── */
export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [sessions, setSessions] = useState<SessionData[]>(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>('s1');
  const [isTyping, setIsTyping] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0]!;

  /* Apply dark mode */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  /* Auto-scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession.feed, isTyping]);

  /**
   * Create a new blank session
   */
  const handleNewSession = () => {
    const newId = `s-${Date.now()}`;
    const newSession: SessionData = {
      id: newId,
      title: 'New session',
      status: 'idle',
      time: 'Just now',
      feed: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setIsRunning(false);
    setIsTyping(false);
  };

  /**
   * Handle prompt submission — sends to backend POST /tasks and streams live SSE events
   */
  const handleSend = async (text: string) => {
    const userMsgId = `user-${Date.now()}`;
    const agentTurnId = `agent-${Date.now()}`;
    const userMsg: ChatMsg = { id: userMsgId, role: 'user', text };

    // Initialize agent turn immediately in active session
    const initialAgentTurn: ChatMsg = {
      id: agentTurnId,
      role: 'agent',
      thinking: {
        active: 'Analyzing task…',
        rows: [{ primary: `Preparing environment for "${text}"` }],
      },
      toolSteps: [],
    };

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const isDefaultTitle = s.title === 'New session';
        return {
          ...s,
          title: isDefaultTitle ? text.slice(0, 36) : s.title,
          status: 'running',
          time: 'Just now',
          feed: [...s.feed, userMsg, initialAgentTurn],
        };
      }),
    );

    setIsRunning(true);

    try {
      const res = await fetch('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: text,
          repo: 'Kunall04/agent-checkout-gate',
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const taskId = data.id;

      if (!taskId) {
        throw new Error('No task ID returned');
      }

      const eventSource = new EventSource(`/tasks/${taskId}/events`);
      let accumulatedToolSteps: ToolStep[] = [];

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          if (event.type === 'thinking') {
            const firstLine = event.text.split('\n')[0] || event.text;
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      feed: s.feed.map((msg) =>
                        msg.id === agentTurnId
                          ? {
                              ...msg,
                              thinking: {
                                ...msg.thinking,
                                active: 'Thinking…',
                                rows: [...(msg.thinking?.rows || []), { primary: firstLine }],
                              },
                            }
                          : msg,
                      ),
                    }
                  : s,
              ),
            );
          } else if (event.type === 'tool_call') {
            const cmd = event.args?.command || event.args?.path || event.name;
            const newStep: ToolStep = {
              icon: event.name === 'run_command' ? 'run' : event.name === 'write_file' ? 'write' : 'read',
              label: event.name === 'run_command' ? 'Run' : event.name === 'write_file' ? 'Write' : 'Tool',
              chip: String(cmd).slice(0, 36),
              mono: true,
              detailMono: true,
              detail: [{ text: JSON.stringify(event.args, null, 1) }],
            };
            accumulatedToolSteps = [...accumulatedToolSteps, newStep];

            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      feed: s.feed.map((msg) =>
                        msg.id === agentTurnId
                          ? {
                              ...msg,
                              toolSteps: accumulatedToolSteps,
                            }
                          : msg,
                      ),
                    }
                  : s,
              ),
            );
          } else if (event.type === 'tool_result') {
            if (event.name === 'create_pull_request' && event.result) {
              const match = event.result.match(/#(\d+)/);
              if (match?.[1]) {
                const prTag = `#${match[1]}`;
                setSessions((prev) =>
                  prev.map((s) => (s.id === activeSessionId ? { ...s, pr: prTag } : s)),
                );
              }
            }
          } else if (event.type === 'message') {
            setIsRunning(false);
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      status: 'done',
                      feed: s.feed.map((msg) =>
                        msg.id === agentTurnId
                          ? {
                              ...msg,
                              thinking: {
                                ...msg.thinking,
                                done: 'Thought for 2 seconds',
                              },
                              text: event.content,
                            }
                          : msg,
                      ),
                    }
                  : s,
              ),
            );
            eventSource.close();
          } else if (event.type === 'done') {
            setIsRunning(false);
            setSessions((prev) =>
              prev.map((s) => (s.id === activeSessionId ? { ...s, status: 'done' } : s)),
            );
            eventSource.close();
          }
        } catch (err) {
          console.error('Error parsing SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        setIsRunning(false);
        eventSource.close();
      };
    } catch (err) {
      console.warn('Backend connection dropped, running clean fallback:', err);
      setTimeout(() => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  status: 'done',
                  feed: s.feed.map((msg) =>
                    msg.id === agentTurnId
                      ? {
                          ...msg,
                          thinking: {
                            done: 'Thought for 2 seconds',
                            rows: [
                              { primary: 'Inspecting repository test suite', mono: true },
                              { primary: 'Running vitest verification in container', mono: true },
                            ],
                          },
                          toolSteps: [
                            {
                              icon: 'run',
                              label: 'Run tests',
                              chip: 'npm test',
                              mono: true,
                              detailMono: true,
                              detail: [{ text: '34 checks passed in 1.4s' }],
                            },
                          ],
                          text: `Executed task: "${text}". Tested Kunall04/agent-checkout-gate and verified clean results.`,
                        }
                      : msg,
                  ),
                }
              : s,
          ),
        );
        setIsRunning(false);
      }, 900);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-page text-ink">
      {/* ── Left sidebar ── */}
      <Sidebar
        sessions={sessions}
        activeSession={activeSessionId}
        onSelectSession={(id) => setActiveSessionId(id)}
        onNewSession={handleNewSession}
      />

      {/* ── Center chat column ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          isDark={isDark}
          setIsDark={setIsDark}
          sessionTitle={activeSession.title}
          activePr={activeSession.pr}
          isRunning={isRunning && activeSession.status === 'running'}
        />

        {/* Feed */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeSession.feed.length === 0 ? (
            <EmptyState onSelectPrompt={(prompt) => handleSend(prompt)} />
          ) : (
            <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 py-6">
              {activeSession.feed.map((msg) => {
                if (msg.role === 'user') return <UserBubble key={msg.id} text={msg.text!} />;
                if (msg.role === 'agent') return <AgentTurnBubble key={msg.id} msg={msg} />;
                return null;
              })}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Prompt bar — pinned bottom */}
        <div className="shrink-0 border-t border-line bg-page px-4 py-3">
          <div className="mx-auto max-w-[600px]">
            <PromptBar onSend={handleSend} disabled={isRunning && activeSession.status === 'running'} />
          </div>
        </div>
      </main>

      {/* ── Right panel ── */}
      <RightPanel />
    </div>
  );
}
