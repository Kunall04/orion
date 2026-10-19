import { useEffect, useRef, useState } from 'react';
import VSCodeIDE from './VSCodeIDE';
import CodeDiffViewer from './CodeDiffViewer';
import InteractiveTerminal from './InteractiveTerminal';
import FileTreeViewer from './FileTreeViewer';
import ApprovalCard from './ApprovalCard';

type PanelTab = 'IDE' | 'Changes' | 'PR' | 'Terminal' | 'Files';

const TABS: PanelTab[] = ['IDE', 'Changes', 'PR', 'Terminal', 'Files'];

const TAB_ICONS: Record<PanelTab, React.ReactNode> = {
  IDE: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M2 8h20" />
      <path d="m8 13 2 2-2 2" />
      <line x1="12" y1="17" x2="15" y2="17" />
    </svg>
  ),
  Changes: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  PR: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  ),
  Terminal: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  Files: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
};

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
  initialWidth = 440,
  minWidth = 300,
  maxWidth = 840,
}: {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}) {
  const [tab, setTab] = useState<PanelTab>('IDE');
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(initialWidth);

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
    // Toggle between default compact (380px) and wide view (640px)
    setWidth((prev) => (prev > 500 ? 380 : 640));
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

      {/* Tab bar */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12.5px] font-medium transition-colors duration-100 ${
                tab === t
                  ? 'bg-surface text-ink shadow-btn'
                  : 'text-ink-3 hover:bg-hover hover:text-ink-2'
              }`}
            >
              <span className={tab === t ? 'text-ink' : 'text-ink-3'}>{TAB_ICONS[t]}</span>
              {t}
            </button>
          ))}
        </div>

        {/* Width toggle button */}
        <button
          type="button"
          onClick={handleDoubleClick}
          title={width > 500 ? 'Compact panel' : 'Expand panel'}
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
            {width > 500 ? (
              <polyline points="4 14 10 14 10 20M20 10 14 10 14 4" />
            ) : (
              <polyline points="15 3 21 3 21 9M9 21 3 21 3 15" />
            )}
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className={`min-h-0 flex-1 ${tab === 'IDE' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
        {tab === 'IDE' && <VSCodeIDE />}
        {tab === 'Changes' && <CodeDiffViewer />}
        {tab === 'PR' && <PRView />}
        {tab === 'Terminal' && <InteractiveTerminal />}
        {tab === 'Files' && <FileTreeViewer />}
      </div>
    </aside>
  );
}
