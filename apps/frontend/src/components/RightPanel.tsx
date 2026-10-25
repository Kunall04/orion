import { useEffect, useRef, useState } from 'react';
import VSCodeIDE, { type TabFile } from './VSCodeIDE';
import CodeDiffViewer, { type FileDiffItem } from './CodeDiffViewer';
import InteractiveTerminal from './InteractiveTerminal';
import FileTreeViewer from './FileTreeViewer';
import ApprovalCard from './ApprovalCard';

export type PanelTab = 'Progress' | 'Changes' | 'PR' | 'Editor';

const TABS: PanelTab[] = ['Progress', 'Changes', 'PR', 'Editor'];

const TAB_CONFIG: Record<
  PanelTab,
  { label: string; icon?: React.ReactNode }
> = {
  Progress: {
    label: 'Progress',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  Changes: {
    label: 'Changes',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  PR: {
    label: 'PR #142',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
  },
  Editor: {
    label: '</> Editor',
  },
};

function ProgressView() {
  const steps = [
    { title: 'Task Initialized', desc: 'Received instruction: "Fix checkout rate-limit test and add bot commit author"', time: '0.1s' },
    { title: 'Sandbox Bootstrapped', desc: 'Started Docker microcontainer orion-box (port 5001)', time: '0.4s' },
    { title: 'Cloned Repository', desc: 'git clone https://github.com/Kunall04/agent-checkout-gate (workspace: /workspace)', time: '0.8s' },
    { title: 'Executed Test Suite', desc: 'vitest run → FAIL src/routes/tasks.test.ts (rate limit assertion 429 missing)', time: '1.2s' },
    { title: 'Synthesized Fix with LLM', desc: 'Groq LLaMA 3.3 70B generated updated route tests and bot attribution setup', time: '1.9s' },
    { title: 'Patched Test Suite', desc: 'Updated apps/backend/src/routes/tasks.test.ts (+12, -2)', time: '0.2s' },
    { title: 'Created Verification Spec', desc: 'Wrote ORION_VERIFICATION.md documentation', time: '0.1s' },
    { title: 'Re-ran Verification in Sandbox', desc: 'vitest run → 34 passed (34 checks clean in 1.4s)', time: '1.4s' },
    { title: 'Committed as Bot Author', desc: 'git commit -m "feat: configure bot user ID attribution" (author: 344046298+orion-coding-agent[bot])', time: '0.3s' },
    { title: 'Pushed to GitHub', desc: 'git push origin orion/fix-rate-limit', time: '0.7s' },
    { title: 'Opened Pull Request #142', desc: 'Merged into main branch ready for human-in-the-loop signoff', time: '0.5s' },
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
          <h4 className="text-[13px] font-semibold text-ink">Agent Execution Progress</h4>
        </div>
        <span className="rounded bg-surface px-2 py-0.5 font-mono text-[10px] text-ink-3 shadow-hairline">
          Total: 5.4s
        </span>
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        {steps.map((s, idx) => (
          <div key={idx} className="flex items-start gap-2.5 rounded-control p-2 hover:bg-hover transition-colors">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green/15 text-[10px] font-bold text-green">
              ✓
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink">{s.title}</span>
                <span className="font-mono text-[10px] text-ink-3">{s.time}</span>
              </div>
              <p className="font-mono text-[11px] text-ink-3 leading-snug break-words">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PRView() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* PR header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 rounded bg-green-tint px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-green">
            Open
          </span>
          <h3 className="text-[13.5px] font-semibold leading-snug text-ink">
            Fix checkout rate-limit test and add bot commit author
          </h3>
        </div>
        <p className="text-[11.5px] text-ink-3">
          <span className="font-mono text-accent">#142</span>
          {' '}· <span className="font-mono">orion-coding-agent[bot]</span> wants to merge
          {' '}<span className="font-mono text-ink-2">4 commits</span> into <span className="font-mono text-ink-2">main</span>
        </p>
      </div>

      {/* Approval card */}
      <ApprovalCard />

      {/* Commit list */}
      <div className="flex flex-col gap-1">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Commits</p>
        {[
          { sha: 'a3f2b1c', msg: 'feat(github): configure bot user ID attribution' },
          { sha: 'd9e4f5a', msg: 'fix(tests): add ORION_VERIFICATION.md' },
          { sha: '7c1a2b3', msg: 'test: ensure sandbox runner exits cleanly' },
          { sha: 'e6d0f2a', msg: 'chore: bump Groq SDK to 0.8.0' },
        ].map((c) => (
          <div key={c.sha} className="flex items-center gap-2 rounded-control px-2.5 py-1.5 hover:bg-hover">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-3">
              <circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" />
            </svg>
            <span className="font-mono text-[10.5px] text-accent">{c.sha}</span>
            <span className="min-w-0 truncate text-[12px] text-ink-2">{c.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RightPanel({
  initialWidth = 460,
  minWidth = 300,
  maxWidth = 860,
  diffs,
  files,
  activeTab,
  onTabChange,
}: {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  diffs?: FileDiffItem[];
  files?: TabFile[];
  activeTab?: PanelTab;
  onTabChange?: (tab: PanelTab) => void;
}) {
  const [tab, setTab] = useState<PanelTab>(activeTab ?? 'Editor');
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(initialWidth);

  useEffect(() => {
    if (activeTab) {
      setTab(activeTab);
    }
  }, [activeTab]);

  const handleTabClick = (nextTab: PanelTab) => {
    setTab(nextTab);
    onTabChange?.(nextTab);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startXRef.current - moveEvent.clientX;
      const maxAllowed = Math.min(maxWidth, Math.floor(window.innerWidth * 0.65));
      const nextWidth = Math.max(minWidth, Math.min(startWidthRef.current + delta, maxAllowed));
      setWidth(nextWidth);
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleDoubleClick = () => {
    // Toggle between default compact (400px) and wide view (660px)
    setWidth((prev) => (prev > 520 ? 400 : 660));
  };

  return (
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-line bg-canvas"
    >
      {/* Draggable resize handle on the left border */}
      <div
        onPointerDown={startResize}
        onDoubleClick={handleDoubleClick}
        title="Drag to resize panel (Double-click to toggle width)"
        className={`group absolute -left-1.5 top-0 bottom-0 z-20 w-3 cursor-col-resize select-none flex items-center justify-center transition-colors ${
          isResizing ? 'bg-accent/20' : 'hover:bg-accent/15'
        }`}
      >
        {/* Subtle pill grip handle indicator */}
        <div
          className={`h-8 w-1 rounded-full transition-all ${
            isResizing ? 'bg-accent scale-y-125' : 'bg-line-strong group-hover:bg-accent group-hover:h-10'
          }`}
        />
      </div>

      {/* Tab bar (Matching Image 2: [Progress] [Changes] [PR #142] [</> Editor] [+]) */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const config = TAB_CONFIG[t];
            const isActive = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTabClick(t)}
                className={`flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium transition-colors duration-100 ${
                  isActive
                    ? 'bg-surface text-ink shadow-btn'
                    : 'text-ink-3 hover:bg-hover hover:text-ink-2'
                }`}
              >
                {config.icon && <span className={isActive ? 'text-ink' : 'text-ink-3'}>{config.icon}</span>}
                <span>{config.label}</span>
                {t === 'Changes' && diffs && diffs.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-green/20 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-green">
                    {diffs.length}
                  </span>
                )}
              </button>
            );
          })}

          {/* Plus Add Tab Button */}
          <button
            type="button"
            title="Add tab"
            className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* Width toggle button */}
        <button
          type="button"
          onClick={handleDoubleClick}
          title={width > 520 ? 'Compact panel' : 'Expand panel'}
          className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {width > 520 ? (
              <polyline points="4 14 10 14 10 20M20 10 14 10 14 4" />
            ) : (
              <polyline points="15 3 21 3 21 9M9 21 3 21 3 15" />
            )}
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="relative min-h-0 flex-1 overflow-hidden flex flex-col">
        {tab === 'Progress' && (
          <div className="h-full overflow-y-auto">
            <ProgressView />
          </div>
        )}
        {tab === 'Changes' && (
          <div className="h-full overflow-y-auto">
            <CodeDiffViewer files={diffs} />
          </div>
        )}
        {tab === 'PR' && (
          <div className="h-full overflow-y-auto">
            <PRView />
          </div>
        )}
        <div className={`h-full flex flex-col ${tab === 'Editor' ? 'flex' : 'hidden'}`}>
          <VSCodeIDE files={files} />
        </div>
      </div>
    </aside>
  );
}
