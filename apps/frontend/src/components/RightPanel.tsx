import { useState } from 'react';
import CodeDiffViewer from './CodeDiffViewer';
import ToolChips from './ToolChips';
import ApprovalCard from './ApprovalCard';

type PanelTab = 'PR' | 'Changes' | 'Terminal' | 'Files';

const TABS: PanelTab[] = ['PR', 'Changes', 'Terminal', 'Files'];

const TAB_ICONS: Record<PanelTab, React.ReactNode> = {
  PR: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  ),
  Changes: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
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

function TerminalView() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="overflow-hidden rounded-card border border-line bg-inset">
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red opacity-60" />
          <span className="h-2.5 w-2.5 rounded-full bg-orange opacity-60" />
          <span className="h-2.5 w-2.5 rounded-full bg-green opacity-60" />
          <span className="ml-2 font-mono text-[11px] text-ink-3">bash — Docker sandbox</span>
        </div>
        <div className="p-3 font-mono text-[11.5px] leading-relaxed text-green">
          <p><span className="text-ink-3">$</span> git clone https://github.com/Kunall04/agent-checkout-gate.git</p>
          <p className="text-ink-3">Cloning into 'agent-checkout-gate'...</p>
          <p className="text-ink-3">remote: Counting objects: 847, done.</p>
          <p><span className="text-ink-3">$</span> npm test</p>
          <p className="text-ink-3">{'>'} agent-checkout-gate@1.0.0 test</p>
          <p className="text-ink-3">{'>'} vitest run</p>
          <p className="mt-1">✓ src/routes/tasks.test.ts (12 tests) 341ms</p>
          <p>✓ src/agent/loop.test.ts (8 tests) 288ms</p>
          <p>✓ src/tools/sandbox.test.ts (14 tests) 1432ms</p>
          <p className="mt-1 text-ink-2">Test Files  3 passed (3)</p>
          <p className="text-ink-2">Tests      34 passed (34)</p>
          <p className="text-ink-2">Duration   2.06s</p>
        </div>
      </div>
      <ToolChips />
    </div>
  );
}

function FilesView() {
  const files = [
    { path: 'apps/backend/src/github/repos.ts', add: 4, del: 2 },
    { path: 'apps/backend/src/github/pr.ts', add: 8, del: 3 },
    { path: 'ORION_VERIFICATION.md', add: 12, del: 0 },
    { path: 'apps/backend/src/agent/loop.ts', add: 2, del: 1 },
  ];

  return (
    <div className="flex flex-col gap-1 p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        Changed files ({files.length})
      </p>
      {files.map((f) => (
        <button
          key={f.path}
          type="button"
          className="flex items-center gap-2 rounded-control px-2.5 py-2 text-left transition-colors duration-100 hover:bg-hover"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2">{f.path}</span>
          <span className="shrink-0 font-mono text-[11px] text-green tabular-nums">+{f.add}</span>
          {f.del > 0 && <span className="shrink-0 font-mono text-[11px] text-red tabular-nums">−{f.del}</span>}
        </button>
      ))}
    </div>
  );
}

export default function RightPanel() {
  const [tab, setTab] = useState<PanelTab>('Changes');

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-line bg-canvas">
      {/* Tab bar */}
      <div className="flex h-[52px] shrink-0 items-center gap-1 border-b border-line px-3">
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

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'PR' && <PRView />}
        {tab === 'Changes' && <CodeDiffViewer />}
        {tab === 'Terminal' && <TerminalView />}
        {tab === 'Files' && <FilesView />}
      </div>
    </aside>
  );
}
