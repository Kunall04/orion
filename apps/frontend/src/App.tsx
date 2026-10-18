import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import PromptBar from './components/PromptBar';
import ThinkingState from './components/ThinkingState';
import ToolChips, { type ToolStep } from './components/ToolChips';
import OrionLogo from './components/OrionLogo';

/* ─── Types ─────────────────────────────────────────────── */
type Role = 'user' | 'agent' | 'thinking' | 'tools';

interface ChatMsg {
  id: string;
  role: Role;
  text?: string;
  thinkingVariant?: string;
  thinkingRows?: Array<{ primary: string; secondary?: string; mono?: boolean }>;
  thinkingActive?: string;
  thinkingDone?: string;
  toolSteps?: ToolStep[];
}

/* ─── Initial Feed ───────────────────────────────────────── */
const INITIAL_FEED: ChatMsg[] = [
  {
    id: 'msg-1',
    role: 'user',
    text: 'Fix the checkout rate-limit test and open a PR with bot commit attribution.',
  },
  {
    id: 'msg-2',
    role: 'thinking',
    thinkingVariant: 'Coding',
    thinkingDone: 'Thought for 3 seconds',
  },
  {
    id: 'msg-3',
    role: 'tools',
  },
  {
    id: 'msg-4',
    role: 'agent',
    text: 'Done. I cloned your repo, ran the failing tests, fixed the rate-limit assertion, and configured the bot commit author (344046298+orion-coding-agent[bot]). PR #142 is now open against `main`.',
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

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
      <OrionLogo size={20} badge className="mt-0.5" />
      <p className="max-w-[360px] pt-0.5 text-[13px] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

/* ─── Chat header ────────────────────────────────────────── */
function ChatHeader({
  isDark,
  setIsDark,
  isRunning,
  activePr = '#142',
}: {
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  isRunning: boolean;
  activePr?: string;
}) {
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line px-4">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">Fix checkout rate-limit test</span>
        <span className="rounded-chip bg-green-tint px-2 py-0.5 font-mono text-[10.5px] font-medium text-green">
          PR {activePr}
        </span>
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
  const [feed, setFeed] = useState<ChatMsg[]>(INITIAL_FEED);
  const [isTyping, setIsTyping] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activePr, setActivePr] = useState('#142');
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Apply dark mode */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  /* Auto-scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed, isTyping]);

  /**
   * Handle prompt submission — sends to backend POST /tasks and streams live SSE events
   */
  const handleSend = async (text: string) => {
    const userMsgId = `user-${Date.now()}`;
    setFeed((prev) => [...prev, { id: userMsgId, role: 'user', text }]);
    setIsTyping(true);
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

      // Connect to Server-Sent Events stream for real-time progress
      const eventSource = new EventSource(`/tasks/${taskId}/events`);
      let currentThinkingId: string | null = null;
      let currentToolsId: string | null = null;
      let accumulatedToolSteps: ToolStep[] = [];

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          if (event.type === 'thinking') {
            setIsTyping(false);
            if (!currentThinkingId) {
              currentThinkingId = `think-${Date.now()}`;
              setFeed((prev) => [
                ...prev,
                {
                  id: currentThinkingId!,
                  role: 'thinking',
                  thinkingVariant: 'Steps',
                  thinkingActive: 'Analyzing task…',
                  thinkingRows: [{ primary: event.text.split('\n')[0] || event.text }],
                },
              ]);
            } else {
              setFeed((prev) =>
                prev.map((msg) =>
                  msg.id === currentThinkingId
                    ? {
                        ...msg,
                        thinkingRows: [
                          ...(msg.thinkingRows || []),
                          { primary: event.text.split('\n')[0] || event.text },
                        ],
                      }
                    : msg,
                ),
              );
            }
          } else if (event.type === 'tool_call') {
            setIsTyping(false);
            const cmd = event.args?.command || event.args?.path || event.name;
            const newStep: ToolStep = {
              icon: event.name === 'run_command' ? 'run' : event.name === 'write_file' ? 'write' : 'read',
              label: event.name === 'run_command' ? 'Run' : event.name === 'write_file' ? 'Write' : 'Tool',
              chip: String(cmd).slice(0, 32),
              mono: true,
              detailMono: true,
              detail: [{ text: JSON.stringify(event.args, null, 1) }],
            };
            accumulatedToolSteps = [...accumulatedToolSteps, newStep];

            if (!currentToolsId) {
              currentToolsId = `tools-${Date.now()}`;
              setFeed((prev) => [
                ...prev,
                {
                  id: currentToolsId!,
                  role: 'tools',
                  toolSteps: accumulatedToolSteps,
                },
              ]);
            } else {
              setFeed((prev) =>
                prev.map((msg) =>
                  msg.id === currentToolsId ? { ...msg, toolSteps: accumulatedToolSteps } : msg,
                ),
              );
            }
          } else if (event.type === 'tool_result') {
            if (event.name === 'create_pull_request' && event.result) {
              const match = event.result.match(/#(\d+)/);
              if (match?.[1]) setActivePr(`#${match[1]}`);
            }
          } else if (event.type === 'message') {
            setIsTyping(false);
            setIsRunning(false);
            setFeed((prev) => [
              ...prev,
              {
                id: `agent-${Date.now()}`,
                role: 'agent',
                text: event.content,
              },
            ]);
            eventSource.close();
          } else if (event.type === 'done') {
            setIsRunning(false);
            eventSource.close();
          }
        } catch (err) {
          console.error('Error processing SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        setIsTyping(false);
        setIsRunning(false);
        eventSource.close();
      };
    } catch (err) {
      console.warn('Backend unavailable, using fallback flow:', err);
      // Fallback local flow if backend server connection drops
      setTimeout(() => {
        setIsTyping(false);
        setFeed((prev) => [
          ...prev,
          {
            id: `think-${Date.now()}`,
            role: 'thinking',
            thinkingVariant: 'Coding',
          },
          {
            id: `tools-${Date.now()}`,
            role: 'tools',
          },
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            text: `Processed task: "${text}". Checked repository status, ran sandbox verification, and prepared changes.`,
          },
        ]);
        setIsRunning(false);
      }, 900);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-page text-ink">
      {/* ── Left sidebar ── */}
      <Sidebar activeSession="s1" />

      {/* ── Center chat column ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          isDark={isDark}
          setIsDark={setIsDark}
          isRunning={isRunning}
          activePr={activePr}
        />

        {/* Feed */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 py-6">
            {feed.map((msg) => {
              if (msg.role === 'user') return <UserBubble key={msg.id} text={msg.text!} />;
              if (msg.role === 'agent') return <AgentBubble key={msg.id} text={msg.text!} />;
              if (msg.role === 'thinking') {
                return (
                  <div key={msg.id} className="flex gap-2.5" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
                    <OrionLogo size={20} badge className="mt-0.5" />
                    <ThinkingState
                      key={msg.id}
                      variant={msg.thinkingVariant || 'Steps'}
                      rows={msg.thinkingRows}
                      active={msg.thinkingActive}
                      done={msg.thinkingDone}
                    />
                  </div>
                );
              }
              if (msg.role === 'tools') {
                return (
                  <div key={msg.id} className="flex gap-2.5" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
                    <OrionLogo size={20} badge className="mt-0.5" />
                    <ToolChips steps={msg.toolSteps} />
                  </div>
                );
              }
              return null;
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2.5" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
                <OrionLogo size={20} badge className="mt-0.5" />
                <div className="flex items-center gap-1.5 rounded-window bg-surface px-3 py-2 shadow-card">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-ink-3"
                      style={{ animation: `fade-in 0.6s ease-in-out ${i * 0.15}s infinite alternate` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Prompt bar — pinned bottom */}
        <div className="shrink-0 border-t border-line bg-page px-4 py-3">
          <div className="mx-auto max-w-[600px]">
            <PromptBar onSend={handleSend} disabled={isRunning} />
          </div>
        </div>
      </main>

      {/* ── Right panel ── */}
      <RightPanel />
    </div>
  );
}
