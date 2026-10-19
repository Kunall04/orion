import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

interface TabFile {
  name: string;
  path: string;
  lang: string;
  content: string;
  modified?: boolean;
  isWelcome?: boolean;
}

const DEFAULT_FILES: TabFile[] = [
  {
    name: '✨ Orion IDE',
    path: 'welcome',
    lang: 'plaintext',
    isWelcome: true,
    content: '',
  },
  {
    name: 'tasks.test.ts',
    path: 'apps/backend/src/routes/tasks.test.ts',
    lang: 'typescript',
    modified: true,
    content: `import { describe, expect, it } from 'vitest';
import { buildApp } from '../app';

describe('POST /tasks rate limit verification', () => {
  it('rejects rapid consecutive requests with 429', async () => {
    const app = buildApp();

    // Verify rate limit threshold trigger
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { instruction: 'fix checkout rate-limit test' },
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });

    // Rate limiter enforces 429 when threshold is reached
    expect(res.statusCode).toBe(429);
  });

  it('allows requests within standard quota', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { instruction: 'healthy task' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
`,
  },
  {
    name: 'ORION_VERIFICATION.md',
    path: 'ORION_VERIFICATION.md',
    lang: 'markdown',
    modified: true,
    content: `# Orion Coding Agent Verification

This repository was verified by Orion Cloud Coding Agent.
- Task: Fix checkout rate-limit test
- Sandbox: Docker (orion-sandbox:5001)
- Author: 344046298+orion-coding-agent[bot]
- Status: Verified (34/34 checks passing)
- Pull Request: #142 against main
`,
  },
  {
    name: 'repos.ts',
    path: 'apps/backend/src/github/repos.ts',
    lang: 'typescript',
    modified: false,
    content: `import type { SandboxClient } from '../sandbox/client';

export async function configureGitUser(sandbox: SandboxClient): Promise<void> {
  const botName = 'orion-coding-agent[bot]';
  const botEmail = '344046298+orion-coding-agent[bot]@users.noreply.github.com';

  await sandbox.runCommand(\`git config --global user.name "\${botName}"\`);
  await sandbox.runCommand(\`git config --global user.email "\${botEmail}"\`);
}
`,
  },
  {
    name: 'package.json',
    path: 'package.json',
    lang: 'json',
    modified: false,
    content: `{
  "name": "cloud-agent",
  "version": "0.0.0",
  "private": true,
  "description": "Orion: Autonomous Software Engineering Agent"
}
`,
  },
];

interface TerminalEntry {
  id: string;
  type: 'in' | 'out' | 'success' | 'info';
  text: string;
}

const INITIAL_TERMINAL: TerminalEntry[] = [
  { id: '1', type: 'info', text: 'Connecting to Docker sandbox (orion-box:5001)...' },
  { id: '2', type: 'in', text: 'npm test' },
  {
    id: '3',
    type: 'success',
    text: `> agent-checkout-gate@1.0.0 test
> vitest run

✓ src/routes/tasks.test.ts (12 tests) 341ms
✓ src/agent/loop.test.ts (8 tests) 288ms
✓ src/tools/sandbox.test.ts (14 tests) 1432ms

Test Files  3 passed (3)
Tests       34 passed (34)
Duration    1.82s`,
  },
];

type ActivityTab = 'explorer' | 'search' | 'git' | 'debug' | 'extensions';
type PanelTab = 'problems' | 'output' | 'debug' | 'terminal';

export default function VSCodeIDE({
  files = DEFAULT_FILES,
}: {
  files?: TabFile[];
}) {
  const [openFiles, setOpenFiles] = useState<TabFile[]>(files);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const activeFile = openFiles[activeFileIdx] || openFiles[0]!;

  // Activity bar state
  const [activeActivity, setActiveActivity] = useState<ActivityTab | null>(null);

  // Bottom panel state
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>('terminal');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(210);
  const [termEntries, setTermEntries] = useState<TerminalEntry[]>(INITIAL_TERMINAL);
  const [cmdInput, setCmdInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const termScrollRef = useRef<HTMLDivElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);

  // Terminal drag-resize state
  const isDraggingTermRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(210);

  useEffect(() => {
    termScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [termEntries]);

  // Synchronize terminal with commands run by the agent from chat
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ command: string; output: string }>;
      if (!customEvent.detail) return;
      const { command, output } = customEvent.detail;
      setTerminalOpen(true);
      setActivePanelTab('terminal');
      setTermEntries((prev) => [
        ...prev,
        { id: `in-${Date.now()}`, type: 'in', text: command },
        { id: `out-${Date.now()}`, type: 'out', text: output },
      ]);
    };

    window.addEventListener('orion:terminal-command', handler);
    return () => window.removeEventListener('orion:terminal-command', handler);
  }, []);

  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const inEntry: TerminalEntry = { id: `in-${Date.now()}`, type: 'in', text: trimmed };
    setTermEntries((prev) => [...prev, inEntry]);
    setHistory((prev) => [trimmed, ...prev]);
    setHistIdx(-1);
    setCmdInput('');

    if (trimmed === 'clear') {
      setTermEntries([]);
      return;
    }

    // Try executing on local sandbox runner endpoint if running
    try {
      const res = await fetch('/tasks/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        setTermEntries((prev) => [
          ...prev,
          { id: `out-${Date.now()}`, type: 'out', text: data.output || '(no output)' },
        ]);
        return;
      }
    } catch {}

    let response = '';
    let rType: TerminalEntry['type'] = 'out';

    if (trimmed === 'npm test' || trimmed === 'npm t') {
      response = `> agent-checkout-gate@1.0.0 test\n> vitest run\n\n✓ src/routes/tasks.test.ts (12 tests) 341ms\n✓ src/agent/loop.test.ts (8 tests) 288ms\n✓ src/tools/sandbox.test.ts (14 tests) 1432ms\n\nTest Files  3 passed (3)\nTests       34 passed (34)\nDuration    1.82s`;
      rType = 'success';
    } else if (trimmed === 'git status') {
      response = `On branch orion/fix-rate-limit\nYour branch is up to date with origin/orion/fix-rate-limit.\n\nChanges to be committed:\n  modified:   apps/backend/src/routes/tasks.test.ts\n  new file:   ORION_VERIFICATION.md`;
    } else if (trimmed === 'git branch') {
      response = `  main\n* orion/fix-rate-limit`;
      rType = 'success';
    } else if (trimmed === 'git diff') {
      response = `diff --git a/apps/backend/src/routes/tasks.test.ts b/apps/backend/src/routes/tasks.test.ts
--- a/apps/backend/src/routes/tasks.test.ts
+++ b/apps/backend/src/routes/tasks.test.ts
@@ -21,11 +21,11 @@ describe('POST /tasks rate limit verification', () => {
-    // Rate limit not asserted
+    // Rate limiter enforces 429 when threshold is reached
+    expect(res.statusCode).toBe(429);`;
    } else if (trimmed.startsWith('cat')) {
      const target = trimmed.replace('cat', '').trim();
      const match = openFiles.find((f) => f.name.includes(target) || f.path.includes(target));
      response = match ? match.content : `File not found: ${target}`;
    } else if (trimmed === 'help') {
      response = `Supported commands: npm test, git status, git diff, git branch, cat <file>, clear`;
      rType = 'info';
    } else {
      response = `bash: ${trimmed.split(' ')[0]}: executed successfully`;
    }

    setTermEntries((prev) => [...prev, { id: `out-${Date.now()}`, type: rType, text: response }]);
  };

  const startResizeTerminal = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingTermRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = terminalHeight;

    const onPointerMove = (ev: PointerEvent) => {
      if (!isDraggingTermRef.current) return;
      const delta = startYRef.current - ev.clientY;
      const nextH = Math.max(80, Math.min(startHeightRef.current + delta, 460));
      setTerminalHeight(nextH);
    };

    const onPointerUp = () => {
      isDraggingTermRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const closeTab = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (openFiles.length <= 1) return;
    const next = openFiles.filter((_, i) => i !== idx);
    setOpenFiles(next);
    setActiveFileIdx(Math.max(0, idx - 1));
  };

  const getFileIcon = (file: TabFile) => {
    if (file.isWelcome) {
      return <span className="text-[12px] text-accent">✦</span>;
    }
    if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) {
      return (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] bg-[#3178c6] text-[8px] font-bold text-white">
          TS
        </span>
      );
    }
    if (file.name.endsWith('.md')) {
      return (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] bg-[#4285f4] text-[8px] font-bold text-white">
          M↓
        </span>
      );
    }
    if (file.name.endsWith('.json')) {
      return (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] bg-[#cbcb41] text-[8px] font-bold text-black">
          {'{ }'}
        </span>
      );
    }
    return <span className="text-[10px] text-ink-3">📄</span>;
  };

  return (
    <div className="flex h-full w-full bg-[#1e1e1e] text-[#cccccc] font-sans overflow-hidden select-none">
      {/* ── Left Activity Bar (VS Code) ── */}
      <aside className="flex w-[46px] shrink-0 flex-col items-center justify-between border-r border-[#262626] bg-[#181818] py-2 text-[#858585]">
        {/* Top Activity Icons */}
        <div className="flex flex-col items-center gap-3">
          {/* Explorer */}
          <button
            type="button"
            title="Explorer (⌘⇧E)"
            onClick={() => setActiveActivity((prev) => (prev === 'explorer' ? null : 'explorer'))}
            className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
              activeActivity === 'explorer' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'explorer' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
          </button>

          {/* Search */}
          <button
            type="button"
            title="Search (⌘⇧F)"
            onClick={() => setActiveActivity((prev) => (prev === 'search' ? null : 'search'))}
            className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
              activeActivity === 'search' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'search' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* Source Control */}
          <button
            type="button"
            title="Source Control (⌃⇧G)"
            onClick={() => setActiveActivity((prev) => (prev === 'git' ? null : 'git'))}
            className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
              activeActivity === 'git' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'git' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8.5px] font-bold text-white">
              2
            </span>
          </button>

          {/* Run & Debug */}
          <button
            type="button"
            title="Run and Debug (⌘⇧D)"
            onClick={() => setActiveActivity((prev) => (prev === 'debug' ? null : 'debug'))}
            className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
              activeActivity === 'debug' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'debug' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>

          {/* Extensions */}
          <button
            type="button"
            title="Extensions (⌘⇧X)"
            onClick={() => setActiveActivity((prev) => (prev === 'extensions' ? null : 'extensions'))}
            className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
              activeActivity === 'extensions' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'extensions' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="7" width="9" height="9" rx="1" /><rect x="13" y="7" width="9" height="9" rx="1" /><rect x="7" y="2" width="10" height="4" rx="1" /><rect x="7" y="18" width="10" height="4" rx="1" />
            </svg>
          </button>
        </div>

        {/* Bottom Activity Icons */}
        <div className="flex flex-col items-center gap-3">
          {/* Account */}
          <button
            type="button"
            title="Accounts"
            className="flex h-8 w-8 items-center justify-center rounded hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </button>

          {/* Settings */}
          <button
            type="button"
            title="Manage Settings (⌘,)"
            className="flex h-8 w-8 items-center justify-center rounded hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Optional Explorer Drawer ── */}
      {activeActivity === 'explorer' && (
        <div className="flex w-[160px] shrink-0 flex-col border-r border-[#262626] bg-[#252526] text-[12px]">
          <div className="flex h-[35px] items-center justify-between px-3 font-semibold uppercase tracking-wider text-[#bbbbbb] border-b border-[#181818]">
            <span>Explorer</span>
            <button
              type="button"
              onClick={() => setActiveActivity(null)}
              className="text-[#858585] hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col p-1.5 gap-0.5 font-mono text-[11px] overflow-y-auto">
            <span className="font-semibold text-accent px-1.5 py-0.5">WORKSPACE</span>
            {openFiles.filter((f) => !f.isWelcome).map((file, i) => (
              <button
                key={file.path}
                type="button"
                onClick={() => {
                  const idx = openFiles.findIndex((f) => f.path === file.path);
                  if (idx !== -1) setActiveFileIdx(idx);
                }}
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-left ${
                  openFiles[activeFileIdx]?.path === file.path
                    ? 'bg-[#37373d] text-white'
                    : 'text-[#969696] hover:bg-[#2a2d2e] hover:text-[#cccccc]'
                }`}
              >
                {getFileIcon(file)}
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Editor & Terminal Column ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── VS Code Tab Bar ── */}
        <div className="flex h-[35px] shrink-0 items-center overflow-x-auto bg-[#252526] border-b border-[#181818]">
          {openFiles.map((file, idx) => {
            const isActive = idx === activeFileIdx;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setActiveFileIdx(idx)}
                className={`group flex h-full items-center gap-2 border-r border-[#181818] px-3 text-[12px] font-mono transition-colors ${
                  isActive
                    ? 'bg-[#1e1e1e] text-white border-t border-t-accent'
                    : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#1e1e1e]/60 hover:text-[#cccccc]'
                }`}
              >
                {getFileIcon(file)}
                <span className="max-w-[140px] truncate">{file.name}</span>
                {file.modified && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent group-hover:hidden" />
                )}
                {openFiles.length > 1 && (
                  <span
                    onClick={(e) => closeTab(e, idx)}
                    className="rounded p-0.5 opacity-0 hover:bg-[#333333] hover:text-white group-hover:opacity-100"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Breadcrumb Bar (when code file is active) ── */}
        {!activeFile.isWelcome && (
          <div className="flex h-[22px] shrink-0 items-center gap-1.5 bg-[#1e1e1e] px-3 font-mono text-[11px] text-[#858585] border-b border-[#2d2d2d]">
            <span>workspace</span>
            <span>›</span>
            <span className="truncate text-[#cccccc]">{activeFile.path}</span>
          </div>
        )}

        {/* ── Editor Body Area ── */}
        <div className="min-h-0 flex-1 relative overflow-hidden bg-[#1e1e1e]">
          {activeFile.isWelcome ? (
            /* Watermark Welcome State (Image 2) */
            <div className="flex h-full w-full flex-col items-center justify-center text-center select-none bg-[#1e1e1e] px-6">
              <div className="flex flex-col gap-5 font-mono text-[12.5px] text-[#858585] w-full max-w-[280px]">
                <div
                  onClick={() => setActiveFileIdx(1)}
                  className="flex items-center justify-between cursor-pointer hover:text-white transition-colors"
                >
                  <span>Go To File</span>
                  <kbd className="rounded bg-[#2d2d2d] px-2 py-0.5 text-[11px] text-[#cccccc] shadow-hairline">⌘ P</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span>Toggle Orion Chat</span>
                  <kbd className="rounded bg-[#2d2d2d] px-2 py-0.5 text-[11px] text-[#cccccc] shadow-hairline">⌘ G</kbd>
                </div>
                <div
                  onClick={() => setActiveFileIdx(1)}
                  className="flex items-center justify-between cursor-pointer hover:text-white transition-colors"
                >
                  <span>Agent</span>
                  <kbd className="rounded bg-[#2d2d2d] px-2 py-0.5 text-[11px] text-[#cccccc] shadow-hairline">⌘ I</kbd>
                </div>
              </div>
            </div>
          ) : (
            /* Monaco Code Editor */
            <Editor
              height="100%"
              path={activeFile.path}
              defaultLanguage={activeFile.lang}
              language={activeFile.lang}
              value={activeFile.content}
              theme="vs-dark"
              onChange={(newVal) => {
                if (newVal !== undefined) {
                  setOpenFiles((prev) =>
                    prev.map((f, i) => (i === activeFileIdx ? { ...f, content: newVal, modified: true } : f))
                  );
                }
              }}
              options={{
                fontSize: 12,
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                cursorBlinking: 'smooth',
                wordWrap: 'on',
                renderLineHighlight: 'all',
                padding: { top: 6, bottom: 6 },
              }}
            />
          )}
        </div>

        {/* ── Integrated Bottom Terminal Panel (Image 2) ── */}
        {terminalOpen ? (
          <div
            style={{ height: terminalHeight }}
            className="flex shrink-0 flex-col border-t border-[#333333] bg-[#181818]"
          >
            {/* Draggable terminal divider */}
            <div
              onPointerDown={startResizeTerminal}
              className="group relative -top-1 h-2 cursor-row-resize flex items-center justify-center hover:bg-accent/20"
            >
              <div className="h-0.5 w-8 rounded-full bg-white/20 group-hover:bg-accent" />
            </div>

            {/* Panel header with tabs: PROBLEMS, OUTPUT, DEBUG CONSOLE, TERMINAL */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#2d2d2d] bg-[#1e1e1e] px-3 font-mono text-[11px]">
              <div className="flex items-center gap-3">
                {(['problems', 'output', 'debug', 'terminal'] as PanelTab[]).map((tabKey) => {
                  const labels: Record<PanelTab, string> = {
                    problems: 'PROBLEMS',
                    output: 'OUTPUT',
                    debug: 'DEBUG CONSOLE',
                    terminal: 'TERMINAL',
                  };
                  const isActive = activePanelTab === tabKey;
                  return (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => setActivePanelTab(tabKey)}
                      className={`relative flex items-center gap-1.5 uppercase tracking-wider py-1 font-semibold transition-colors ${
                        isActive ? 'text-white' : 'text-[#858585] hover:text-[#cccccc]'
                      }`}
                    >
                      <span>{labels[tabKey]}</span>
                      {tabKey === 'problems' && (
                        <span className="rounded bg-[#333333] px-1 py-0.2 text-[9px] text-[#aaaaaa]">0</span>
                      )}
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Terminal right toolbar */}
              <div className="flex items-center gap-1.5 text-[#858585]">
                <div className="flex items-center gap-1 rounded bg-[#252526] px-1.5 py-0.5 text-[10px] text-white">
                  <span>bash</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                <button
                  type="button"
                  title="New Terminal"
                  onClick={() => handleCommand('clear')}
                  className="rounded p-1 hover:bg-[#333333] hover:text-white"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setTermEntries([])}
                  title="Kill Terminal"
                  className="rounded p-1 hover:bg-[#333333] hover:text-white"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalOpen(false)}
                  title="Close Panel"
                  className="rounded p-1 hover:bg-[#333333] hover:text-white"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Terminal content area */}
            <div
              className="min-h-0 flex-1 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed text-[#cccccc] select-text"
              onClick={() => termInputRef.current?.focus()}
            >
              {termEntries.map((item) => (
                <div key={item.id} className="py-0.5">
                  {item.type === 'in' ? (
                    <div className="flex items-center gap-1.5 text-white">
                      <span className="text-green select-none">○ ubuntu@orion-box:~$</span>
                      <span>{item.text}</span>
                    </div>
                  ) : (
                    <pre
                      className={`whitespace-pre-wrap font-mono ${
                        item.type === 'success'
                          ? 'text-green'
                          : item.type === 'info'
                            ? 'text-[#858585]'
                            : 'text-[#cccccc]'
                      }`}
                    >
                      {item.text}
                    </pre>
                  )}
                </div>
              ))}
              <div ref={termScrollRef} />
            </div>

            {/* Quick command pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-[#262626] bg-[#191919] px-2.5 py-1">
              <span className="text-[10px] uppercase tracking-wider text-[#666666] font-mono shrink-0 select-none">Quick:</span>
              {[
                { label: 'npm test', cmd: 'npm test' },
                { label: 'git status', cmd: 'git status' },
                { label: 'git diff', cmd: 'git diff' },
                { label: 'git branch', cmd: 'git branch' },
                { label: 'clear', cmd: 'clear' },
              ].map((p) => (
                <button
                  key={p.cmd}
                  type="button"
                  onClick={() => handleCommand(p.cmd)}
                  className="shrink-0 rounded bg-[#272727] px-2 py-0.5 font-mono text-[10px] text-[#aaaaaa] hover:bg-accent/20 hover:text-accent transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Terminal prompt input with ⌘K prompt helper */}
            <div className="flex items-center gap-2 border-t border-[#2d2d2d] bg-[#141414] px-2.5 py-1">
              <span className="font-mono text-[11px] text-green select-none shrink-0 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green" />
                ubuntu@orion-box:~$
              </span>
              <input
                ref={termInputRef}
                type="text"
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCommand(cmdInput);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (history.length === 0) return;
                    const nextIdx = Math.min(histIdx + 1, history.length - 1);
                    setHistIdx(nextIdx);
                    setCmdInput(history[nextIdx] ?? '');
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (histIdx <= 0) {
                      setHistIdx(-1);
                      setCmdInput('');
                    } else {
                      const nextIdx = histIdx - 1;
                      setHistIdx(nextIdx);
                      setCmdInput(history[nextIdx] ?? '');
                    }
                  }
                }}
                placeholder="⌘K to generate a command..."
                className="flex-1 bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-[#555555]"
              />
              <span className="text-[10px] font-mono text-[#555555] shrink-0 select-none">
                ⌘K
              </span>
            </div>
          </div>
        ) : (
          /* Minimized Terminal Bar */
          <div className="flex h-6 shrink-0 items-center justify-between border-t border-[#333333] bg-[#1e1e1e] px-3 font-mono text-[10px] text-[#858585]">
            <button
              type="button"
              onClick={() => setTerminalOpen(true)}
              className="flex items-center gap-1.5 hover:text-white"
            >
              <span>▲ TERMINAL</span>
              <span className="text-green font-semibold">● orion-box online</span>
            </button>
          </div>
        )}

        {/* ── Status Bar (Image 2) ── */}
        <div className="flex h-5 shrink-0 items-center justify-between bg-[#007acc] px-2 font-mono text-[10px] text-white">
          <div className="flex items-center gap-2">
            <span>⎇ orion/fix-rate-limit</span>
            <span>⊗ 0  ⚠ 0</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Ln 14, Col 22</span>
            <span>UTF-8</span>
            <span>{activeFile.lang.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
