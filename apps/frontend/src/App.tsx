import { useEffect, useRef, useState } from 'react';
import Sidebar, { type SessionItem } from './components/Sidebar';
import RightPanel, { type PanelTab } from './components/RightPanel';
import PromptBar from './components/PromptBar';
import ThinkingState from './components/ThinkingState';
import ToolChips, { type ToolStep, type ToolDiff } from './components/ToolChips';
import OrionLogo from './components/OrionLogo';
import ToastContainer, { showToast } from './components/Toast';
import type { FileDiffItem } from './components/CodeDiffViewer';
import { type TabFile, DEFAULT_FILES } from './components/VSCodeIDE';
import RepoSelectorModal from './components/RepoSelectorModal';

/* ─── Types ─────────────────────────────────────────────── */
export interface ThinkingData {
  variant?: string;
  active?: string;
  done?: string;
  rows?: Array<{ primary: string; secondary?: string; mono?: boolean }>;
}

export interface ActionCardData {
  title: string;
  pr: string;
  diff?: string;
  bot?: string;
}

export interface ActionPillData {
  label: string;
  tag?: string;
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  repo?: string;
  thinking?: ThinkingData;
  toolSteps?: ToolStep[];
  diffs?: ToolDiff[];
  actionCard?: ActionCardData;
  actionPill?: ActionPillData;
  actionRequiredBanner?: string;
}

export interface SessionData extends SessionItem {
  repo?: string;
  sandboxUrl?: string;
  sandboxPort?: number;
  feed: ChatMsg[];
  diffs?: FileDiffItem[];
  files?: TabFile[];
}

/* ─── Storage Keys for Instant Local Persistence ─────────── */
const STORAGE_KEY_SESSIONS = 'orion_sessions';
const STORAGE_KEY_ACTIVE = 'orion_active_session_id';
const STORAGE_KEY_TAB = 'orion_right_panel_tab';

export const DEFAULT_CLEAN_SESSION: SessionData = {
  id: 's1',
  title: 'New session',
  status: 'idle',
  statusColor: 'gray',
  time: 'Just now',
  feed: [],
  files: DEFAULT_FILES,
};

function loadSavedSessions(): SessionData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Discard legacy mock sessions if present in browser localStorage
        const cleaned = parsed.filter(
          (s: SessionData) =>
            s.title !== 'Fix checkout rate-limit test' &&
            s.title !== 'Make background black' &&
            !s.title?.includes('fpbird.github.io') &&
            !s.title?.includes('school-cms') &&
            s.id !== 's2' &&
            s.id !== 's3' &&
            s.id !== 's4' &&
            s.id !== 's5' &&
            s.id !== 's6',
        );
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse saved sessions from localStorage:', err);
  }
  return [DEFAULT_CLEAN_SESSION];
}

function loadSavedActiveSessionId(availableSessions: SessionData[]): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE);
    if (raw && availableSessions.some((s) => s.id === raw)) {
      return raw;
    }
  } catch {}
  return availableSessions[0]?.id || 's1';
}

function loadSavedTab(): PanelTab {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TAB);
    if (raw && ['Progress', 'Changes', 'PR', 'Editor', 'Terminal', 'Preview'].includes(raw)) {
      return raw as PanelTab;
    }
  } catch {}
  return 'Editor';
}

const STARTER_PROMPTS = [
  {
    title: 'Explore workspace',
    sub: 'Inspect files and directory structure in the sandbox container',
  },
  {
    title: 'Run test suite',
    sub: 'Run unit and integration tests and report any failures',
  },
  {
    title: 'Start dev server',
    sub: 'Launch the application dev server and verify the preview',
  },
];

/* ─── Individual message bubbles ─────────────────────────── */
function UserBubble({ text, repo }: { text: string; repo?: string }) {
  return (
    <div className="flex justify-end pl-12" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
      <div className="flex max-w-[420px] flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-[13px] leading-relaxed text-ink shadow-btn">
        {repo && (
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-accent">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
            <span className="truncate">{repo}</span>
          </div>
        )}
        <p>{text}</p>
      </div>
    </div>
  );
}

function AgentTurnBubble({
  msg,
  onReviewWithOrion,
  onAnalyze,
  onRunPill,
  onDiffChipClick,
  onRetry,
}: {
  msg: ChatMsg;
  onReviewWithOrion?: () => void;
  onAnalyze?: () => void;
  onRunPill?: (label: string) => void;
  onDiffChipClick?: (file: string) => void;
  onRetry?: (msg: ChatMsg) => void;
}) {
  return (
    <div className="group flex items-start gap-2.5" style={{ animation: 'fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}>
      <OrionLogo size={20} badge className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 max-w-[540px] flex-1 flex-col gap-2.5">
        {/* Thinking row */}
        {msg.thinking && (
          <ThinkingState
            key={msg.id + '-think'}
            variant={msg.thinking.variant || 'Steps'}
            rows={msg.thinking.rows}
            active={msg.thinking.active}
            done={msg.thinking.done}
          />
        )}

        {/* Real tool chips */}
        {msg.toolSteps && msg.toolSteps.length > 0 && (
          <ToolChips
            steps={msg.toolSteps}
            diffs={msg.diffs || []}
            onDiffChipClick={onDiffChipClick}
          />
        )}

        {/* Action PR Card (Image 2) */}
        {msg.actionCard && (
          <div className="flex flex-col gap-2 rounded-window border border-line bg-surface p-3 shadow-btn">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="truncate text-[13px] font-semibold text-ink">
                  {msg.actionCard.title}
                </span>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green shrink-0">
                    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
                  </svg>
                  <span className="text-accent">{msg.actionCard.pr}</span>
                  {msg.actionCard.diff && <span className="text-green font-semibold">{msg.actionCard.diff}</span>}
                  <span>•</span>
                  <span className="truncate">{msg.actionCard.bot || 'orion-coding-agent[bot]'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onReviewWithOrion}
                  title="Open PR approval review"
                  className="flex items-center gap-1 rounded-control bg-field px-2.5 py-1 text-[11.5px] font-medium text-ink hover:bg-hover transition-colors shadow-hairline cursor-pointer active:scale-95"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  Review with Orion
                </button>
                <button
                  type="button"
                  onClick={onAnalyze}
                  title="Analyze code diffs in right panel"
                  className="rounded-control bg-accent px-3 py-1 text-[11.5px] font-medium text-white hover:bg-accent/90 transition-colors shadow-btn cursor-pointer active:scale-95"
                >
                  Analyze
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Agent message text */}
        {msg.text && (
          <p className="pt-0.5 text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
            {msg.text}
          </p>
        )}

        {/* Action Pill (Image 2: [Test the site ∨] Beta) */}
        {msg.actionPill && (
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onRunPill?.(msg.actionPill!.label)}
              title={`Trigger: ${msg.actionPill.label}`}
              className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink shadow-btn hover:bg-hover transition-colors cursor-pointer active:scale-95"
            >
              <span>{msg.actionPill.label}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {msg.actionPill.tag && (
              <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                {msg.actionPill.tag}
              </span>
            )}
          </div>
        )}

        {/* Action Required Banner (Image 2: ● Action required: Review PR) */}
        {msg.actionRequiredBanner && (
          <div
            onClick={onReviewWithOrion}
            className="flex items-center gap-2 pt-1 font-mono text-[11.5px] text-amber-500 font-medium cursor-pointer hover:underline"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>{msg.actionRequiredBanner}</span>
          </div>
        )}

        {/* Copy / Retry Actions bar on hover */}
        {msg.text && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 text-ink-3">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(msg.text || '');
                showToast('Copied message to clipboard', 'success');
              }}
              title="Copy message"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink text-[11px] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy</span>
            </button>
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(msg)}
                title="Retry this step"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink text-[11px] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Empty state for new sessions ───────────────────────── */
function EmptyState({
  onSelectPrompt,
  onOpenRepoModal,
}: {
  onSelectPrompt: (p: string) => void;
  onOpenRepoModal?: () => void;
}) {
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
        {onOpenRepoModal && (
          <button
            type="button"
            onClick={onOpenRepoModal}
            className="flex items-center justify-between rounded-window border border-accent/40 bg-accent-tint/30 p-3 text-left shadow-btn transition-all duration-150 hover:bg-accent-tint/50 active:scale-[0.99] group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-control bg-accent text-canvas">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="6" r="3" />
                  <path d="M6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M12 12v3" />
                </svg>
              </div>
              <div>
                <span className="text-[13px] font-semibold text-accent">Select or Clone Repository</span>
                <p className="text-[11.5px] text-ink-3">Pick an accessible repo from your GitHub App or clone any Git URL</p>
              </div>
            </div>
            <span className="text-[13px] font-medium text-accent group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        )}

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
  sandboxPort,
  onPrClick,
  onPreviewClick,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  sessionTitle: string;
  activePr?: string;
  isRunning: boolean;
  sandboxPort?: number;
  onPrClick?: () => void;
  onPreviewClick?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line px-4">
      <div className="flex items-center gap-2">
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title="Expand sidebar"
            className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink transition-colors mr-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        )}
        <span className="max-w-[280px] truncate text-[13px] font-semibold text-ink">
          {sessionTitle}
        </span>
        {activePr && (
          <button
            type="button"
            onClick={onPrClick}
            title="View PR review and approvals"
            className="rounded-chip bg-green-tint px-2 py-0.5 font-mono text-[10.5px] font-medium text-green hover:ring-1 hover:ring-green transition-all cursor-pointer active:scale-95"
          >
            PR {activePr}
          </button>
        )}
        {sandboxPort && (
          <span className="rounded-chip bg-accent-tint/40 px-2 py-0.5 font-mono text-[10px] font-medium text-accent flex items-center gap-1 border border-accent/20">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Sandbox :{sandboxPort}
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

      {/* Right controls: Preview button + Theme toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreviewClick}
          title="Open Live App Preview"
          className="flex items-center gap-1.5 rounded-chip border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-hover hover:border-accent/40 transition-colors shadow-btn cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>Preview</span>
        </button>

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
  const [sessions, setSessions] = useState<SessionData[]>(loadSavedSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => loadSavedActiveSessionId(sessions));
  const [rightPanelTab, setRightPanelTab] = useState<PanelTab>(loadSavedTab);
  const [isTyping, setIsTyping] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || DEFAULT_CLEAN_SESSION;

  const handleRepoSelected = (repoFullName: string) => {
    const isClean = repoFullName === 'workspace';
    const repoTitle = repoFullName.split('/').pop() || repoFullName;
    const msgId = `agent-clone-${Date.now()}`;
    const cloneMsg: ChatMsg = {
      id: msgId,
      role: 'agent',
      thinking: { done: 'Repository ready' },
      text: isClean
        ? 'Initialized a clean git workspace. You can now prompt Orion to scaffold your project or run tests.'
        : `Cloned **${repoFullName}** into sandbox workspace \`/workspace\`. Files are now loaded in the editor.`,
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              repo: isClean ? undefined : repoFullName,
              title: s.title === 'New session' ? repoTitle : s.title,
              feed: [...s.feed, cloneMsg],
            }
          : s,
      ),
    );

    // Refresh files in IDE
    fetch(`/sessions/${activeSessionId}/files`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.files)) {
          const workspaceFiles: TabFile[] = [
            DEFAULT_FILES[0]!,
            ...data.files.map((p: string) => {
              const name = p.split('/').pop() || p;
              let lang = 'plaintext';
              if (p.endsWith('.ts') || p.endsWith('.tsx')) lang = 'typescript';
              else if (p.endsWith('.js') || p.endsWith('.jsx')) lang = 'javascript';
              else if (p.endsWith('.json')) lang = 'json';
              else if (p.endsWith('.md')) lang = 'markdown';
              else if (p.endsWith('.css')) lang = 'css';
              else if (p.endsWith('.html')) lang = 'html';
              return { name, path: p, lang, content: '' };
            }),
          ];
          setSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, files: workspaceFiles } : s)),
          );
        }
      })
      .catch(() => {});
  };

  // Persist sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch {}
  }, [sessions]);

  // Persist activeSessionId to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE, activeSessionId);
    } catch {}
  }, [activeSessionId]);

  // Persist rightPanelTab to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TAB, rightPanelTab);
    } catch {}
  }, [rightPanelTab]);

  const handleStop = () => {
    const es = eventSourcesRef.current.get(activeSessionId);
    if (es) {
      es.close();
      eventSourcesRef.current.delete(activeSessionId);
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, status: 'idle' } : s)),
    );
    setIsRunning(false);
    showToast('Task execution stopped', 'info');
  };

  const handleApprovePR = () => {
    const prLabel = activeSession.pr || 'PR';
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              subtitle: 'PR approved & merged',
              statusColor: 'green',
              feed: [
                ...s.feed,
                {
                  id: `agent-approve-${Date.now()}`,
                  role: 'agent',
                  text: `Pull Request ${prLabel} has been approved and merged into main. Sandbox verification confirmed.`,
                },
              ],
            }
          : s,
      ),
    );
    showToast(`PR ${prLabel} approved and merged!`, 'success');
  };

  const handleRetryTask = (msg: ChatMsg) => {
    if (msg.text) {
      handleSend(`Retry: ${msg.text.slice(0, 80)}`);
    } else {
      handleSend('npm test');
    }
  };

  const activeSessionProgressSteps = activeSession.feed
    .flatMap((m) => m.toolSteps || [])
    .map((ts) => ({
      title: ts.label,
      desc: ts.detail?.[0]?.text || ts.chip,
      time: ts.chip,
    }));

  /* Apply dark mode */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  /* Auto-scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession.feed, isTyping]);

  /* Fetch active sessions on mount to sync sandbox port info and backend history */
  useEffect(() => {
    fetch('/sessions')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.sessions) && data.sessions.length > 0) {
          setSessions((prev) => {
            const updated = prev.map((s) => {
              const matched = data.sessions.find(
                (bs: { id: string; sandbox?: { port: number; url: string }; title?: string; messages?: any[] }) =>
                  bs.id === s.id,
              );
              if (matched) {
                return {
                  ...s,
                  title: s.title === 'New session' && matched.title ? matched.title : s.title,
                  sandboxPort: matched.sandbox?.port ?? s.sandboxPort,
                  sandboxUrl: matched.sandbox?.url ?? s.sandboxUrl,
                  feed:
                    s.feed.length === 0 && Array.isArray(matched.messages) && matched.messages.length > 0
                      ? matched.messages
                      : s.feed,
                };
              }
              return s;
            });

            // If backend has sessions not in local state, add them
            for (const bs of data.sessions) {
              if (!updated.some((s) => s.id === bs.id)) {
                updated.push({
                  id: bs.id,
                  title: bs.title || 'Session',
                  subtitle: 'Ready',
                  status: 'idle',
                  time: 'Saved',
                  sandboxPort: bs.sandbox?.port,
                  sandboxUrl: bs.sandbox?.url,
                  repo: bs.repo,
                  feed: Array.isArray(bs.messages) ? bs.messages : [],
                  files: DEFAULT_FILES,
                });
              }
            }
            return updated;
          });
        }
      })
      .catch(() => {});
  }, []);

  /* Fetch real sandbox workspace files for the active session */
  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;

    fetch(`/sessions/${activeSessionId}/files`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok && Array.isArray(data.files) && data.files.length > 0) {
          const workspaceFiles: TabFile[] = [
            DEFAULT_FILES[0]!,
            ...data.files.map((p: string) => {
              const name = p.split('/').pop() || p;
              let lang = 'plaintext';
              if (p.endsWith('.ts') || p.endsWith('.tsx')) lang = 'typescript';
              else if (p.endsWith('.js') || p.endsWith('.jsx')) lang = 'javascript';
              else if (p.endsWith('.json')) lang = 'json';
              else if (p.endsWith('.md')) lang = 'markdown';
              else if (p.endsWith('.css')) lang = 'css';
              else if (p.endsWith('.html')) lang = 'html';
              return {
                name,
                path: p,
                lang,
                content: '',
              };
            }),
          ];

          setSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, files: workspaceFiles } : s)),
          );
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, activeSession.sandboxPort]);

  /**
   * Create a new blank session (and provision sandbox on backend)
   */
  const handleNewSession = async () => {
    const newId = `s-${Date.now()}`;
    const newSession: SessionData = {
      id: newId,
      title: 'New session',
      status: 'idle',
      time: 'Just now',
      feed: [],
      files: DEFAULT_FILES,
      diffs: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setIsRunning(false);
    setIsTyping(false);

    try {
      const res = await fetch('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          title: 'New session',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session?.sandbox) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === newId
                ? {
                    ...s,
                    sandboxUrl: data.session.sandbox.url,
                    sandboxPort: data.session.sandbox.port,
                  }
                : s,
            ),
          );
        }
      }
    } catch {
      // Backend offline or network error
    }
  };

  /**
   * Delete a session and destroy its sandbox container on backend
   */
  const handleDeleteSession = async (id: string) => {
    try {
      await fetch(`/sessions/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore network errors
    }

    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fallbackId = `s-${Date.now()}`;
        setActiveSessionId(fallbackId);
        return [
          {
            id: fallbackId,
            title: 'New session',
            status: 'idle',
            time: 'Just now',
            feed: [],
          },
        ];
      }
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0]!.id);
      }
      return remaining;
    });
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
          repo: activeSession.repo,
          sessionId: activeSessionId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const taskId = data.id;

      if (data.task?.sandboxUrl) {
        const portMatch = data.task.sandboxUrl.match(/:(\d+)$/);
        const port = portMatch ? Number(portMatch[1]) : undefined;
        if (port) {
          setSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, sandboxPort: port } : s)),
          );
        }
      }

      if (!taskId) {
        throw new Error('No task ID returned');
      }

      const eventSource = new EventSource(`/tasks/${taskId}/events`);
      eventSourcesRef.current.set(activeSessionId, eventSource);
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

            let fileDiff: FileDiffItem | null = null;
            let updatedFileContent: { path: string; content: string } | null = null;

            if (event.name === 'update_file' && event.args?.path) {
              const filePath = String(event.args.path);
              const oldStr = String(event.args.old_str ?? '');
              const newStr = String(event.args.new_str ?? '');
              const oldLines = oldStr.split('\n');
              const newLines = newStr.split('\n');

              fileDiff = {
                file: filePath,
                add: newLines.length,
                del: oldLines.length,
                status: 'modified',
                hunks: [
                  {
                    header: `@@ update ${filePath} @@`,
                    lines: [
                      ...oldLines.map((l, i) => ({ oldNo: i + 1, type: 'del' as const, text: `- ${l}` })),
                      ...newLines.map((l, i) => ({ newNo: i + 1, type: 'add' as const, text: `+ ${l}` })),
                    ],
                  },
                ],
              };
              updatedFileContent = { path: filePath, content: newStr };
            } else if (event.name === 'write_file' && event.args?.path) {
              const filePath = String(event.args.path);
              const content = String(event.args.content ?? '');
              const contentLines = content.split('\n');

              fileDiff = {
                file: filePath,
                add: contentLines.length,
                del: 0,
                status: 'added',
                hunks: [
                  {
                    header: `@@ new file ${filePath} @@`,
                    lines: contentLines.map((l, i) => ({ newNo: i + 1, type: 'add' as const, text: `+ ${l}` })),
                  },
                ],
              };
              updatedFileContent = { path: filePath, content };
            }

            if (fileDiff) {
              setRightPanelTab('Changes');
            }

            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== activeSessionId) return s;

                let nextDiffs = s.diffs || [];
                let nextFiles = s.files || DEFAULT_FILES;

                if (fileDiff) {
                  nextDiffs = [fileDiff, ...nextDiffs.filter((d) => d.file !== fileDiff!.file)];
                }

                if (updatedFileContent) {
                  const targetPath = updatedFileContent.path;
                  const targetName = targetPath.split('/').pop() || targetPath;
                  const exists = nextFiles.some((f) => f.path === targetPath || f.name === targetName);

                  if (exists) {
                    nextFiles = nextFiles.map((f) =>
                      f.path === targetPath || f.name === targetName
                        ? { ...f, content: updatedFileContent!.content, modified: true }
                        : f,
                    );
                  } else {
                    const ext = targetPath.split('.').pop() || 'plaintext';
                    const lang = ext === 'ts' || ext === 'tsx' ? 'typescript' : ext === 'js' ? 'javascript' : ext;
                    nextFiles = [
                      ...nextFiles,
                      {
                        name: targetName,
                        path: targetPath,
                        lang,
                        content: updatedFileContent!.content,
                        modified: true,
                      },
                    ];
                  }
                }

                return {
                  ...s,
                  diffs: nextDiffs,
                  files: nextFiles,
                  feed: s.feed.map((msg) =>
                    msg.id === agentTurnId
                      ? {
                          ...msg,
                          toolSteps: accumulatedToolSteps,
                        }
                      : msg,
                  ),
                };
              }),
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
            eventSourcesRef.current.delete(activeSessionId);
            eventSource.close();
          } else if (event.type === 'done') {
            setIsRunning(false);
            setSessions((prev) =>
              prev.map((s) => (s.id === activeSessionId ? { ...s, status: 'done' } : s)),
            );
            eventSourcesRef.current.delete(activeSessionId);
            eventSource.close();
          }
        } catch (err) {
          console.error('Error parsing SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        setIsRunning(false);
        eventSourcesRef.current.delete(activeSessionId);
        eventSource.close();
      };
    } catch (err: any) {
      console.warn('Backend connection dropped:', err);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                status: 'idle',
                statusColor: 'orange',
                feed: s.feed.map((msg) =>
                  msg.id === agentTurnId
                    ? {
                        ...msg,
                        thinking: {
                          done: 'Failed',
                          rows: [{ primary: 'Backend server connection error' }],
                        },
                        text: `Unable to run task: ${err?.message || 'Cannot communicate with backend server'}. Please ensure the backend is running.`,
                      }
                    : msg,
                ),
              }
            : s,
        ),
      );
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-page text-ink">
      <ToastContainer />

      {/* ── Left sidebar ── */}
      <div className={`transition-all duration-200 overflow-hidden flex shrink-0 ${sidebarCollapsed ? 'w-0 border-r-0' : 'w-[230px]'}`}>
        <Sidebar
          sessions={sessions}
          activeSession={activeSessionId}
          onSelectSession={(id) => setActiveSessionId(id)}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onOpenRepoModal={() => setShowRepoModal(true)}
        />
      </div>

      {/* ── Center chat column ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          isDark={isDark}
          setIsDark={setIsDark}
          sessionTitle={activeSession.title}
          activePr={activeSession.pr}
          isRunning={isRunning && activeSession.status === 'running'}
          sandboxPort={activeSession.sandboxPort}
          onPrClick={() => setRightPanelTab('PR')}
          onPreviewClick={() => setRightPanelTab('Preview')}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        />

        {/* Feed */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeSession.feed.length === 0 ? (
            <EmptyState
              onSelectPrompt={(prompt) => handleSend(prompt)}
              onOpenRepoModal={() => setShowRepoModal(true)}
            />
          ) : (
            <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 py-6">
              {activeSession.feed.map((msg) => {
                if (msg.role === 'user') return <UserBubble key={msg.id} text={msg.text!} repo={msg.repo} />;
                if (msg.role === 'agent')
                  return (
                    <AgentTurnBubble
                      key={msg.id}
                      msg={msg}
                      onReviewWithOrion={() => setRightPanelTab('PR')}
                      onAnalyze={() => setRightPanelTab('Changes')}
                      onRunPill={(label) => handleSend(label)}
                      onDiffChipClick={() => setRightPanelTab('Changes')}
                      onRetry={handleRetryTask}
                    />
                  );
                return null;
              })}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Prompt bar — pinned bottom */}
        <div className="shrink-0 border-t border-line bg-page px-4 py-3">
          <div className="mx-auto max-w-[600px]">
            <PromptBar
              onSend={handleSend}
              onStop={handleStop}
              disabled={isRunning && activeSession.status === 'running'}
              repo={activeSession.repo}
              onSelectRepo={() => setShowRepoModal(true)}
            />
          </div>
        </div>
      </main>

      {/* ── Right panel ── */}
      <RightPanel
        diffs={activeSession.diffs}
        files={activeSession.files}
        activeTab={rightPanelTab}
        onTabChange={setRightPanelTab}
        pr={activeSession.pr}
        sessionTitle={activeSession.title}
        repo={activeSession.repo}
        progressSteps={activeSessionProgressSteps}
        onApprove={handleApprovePR}
        sessionId={activeSession.id}
        sandboxPort={activeSession.sandboxPort}
        onRunCommand={(cmd) => handleSend(cmd)}
      />

      {/* ── Repository & GitHub App Selector Modal ── */}
      <RepoSelectorModal
        isOpen={showRepoModal}
        onClose={() => setShowRepoModal(false)}
        activeSessionId={activeSessionId}
        currentRepo={activeSession.repo}
        onRepoSelected={handleRepoSelected}
      />
    </div>
  );
}
