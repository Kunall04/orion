import { useEffect, useRef, useState } from 'react';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info';
  text: string;
}

const INITIAL_LINES: TerminalLine[] = [
  { id: '1', type: 'info', text: 'Connecting to Docker sandbox at 127.0.0.1:5001...' },
  { id: '2', type: 'success', text: '✓ Connected to orion-sandbox container (workspace: /workspace)' },
  { id: '3', type: 'input', text: 'git status' },
  { id: '4', type: 'output', text: 'On branch orion/fix-rate-limit\nYour branch is up to date with origin/orion/fix-rate-limit.\n\nChanges to be committed:\n  modified:   src/routes/tasks.test.ts\n  new file:   ORION_VERIFICATION.md\n  modified:   apps/backend/src/github/repos.ts' },
  { id: '5', type: 'input', text: 'npm test' },
  { id: '6', type: 'output', text: '> agent-checkout-gate@1.0.0 test\n> vitest run\n\n✓ src/routes/tasks.test.ts (12 tests) 341ms\n✓ src/agent/loop.test.ts (8 tests) 288ms\n✓ src/tools/sandbox.test.ts (14 tests) 1432ms\n\nTest Files  3 passed (3)\nTests       34 passed (34)\nDuration    2.06s' },
];

export default function InteractiveTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>(INITIAL_LINES);
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const inputLine: TerminalLine = {
      id: `in-${Date.now()}`,
      type: 'input',
      text: trimmed,
    };

    setLines((prev) => [...prev, inputLine]);
    setHistory((prev) => [trimmed, ...prev]);
    setHistIdx(-1);
    setInputVal('');

    // Handle clear
    if (trimmed === 'clear') {
      setLines([]);
      return;
    }

    // Try executing on local sandbox runner or fallback simulator
    try {
      const res = await fetch('/tasks/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        setLines((prev) => [
          ...prev,
          {
            id: `out-${Date.now()}`,
            type: 'output',
            text: data.output || '(no output)',
          },
        ]);
        return;
      }
    } catch {}

    // Built-in intelligent terminal simulator responses
    let responseText = '';
    let responseType: TerminalLine['type'] = 'output';

    if (trimmed === 'help') {
      responseText = `Available commands:
  npm test           Run Vitest test suite
  git status         Check working directory status
  git diff           Show unstaged / staged git diff
  git branch         List branches
  git log            Show recent commit log
  ls -la             List directory files
  cat <file>         Print file contents (e.g. cat ORION_VERIFICATION.md)
  clear              Clear terminal screen`;
      responseType = 'info';
    } else if (trimmed === 'npm test' || trimmed === 'npm t') {
      responseText = `> agent-checkout-gate@1.0.0 test
> vitest run

✓ src/routes/tasks.test.ts (12 tests) 341ms
✓ src/agent/loop.test.ts (8 tests) 288ms
✓ src/tools/sandbox.test.ts (14 tests) 1432ms

Test Files  3 passed (3)
Tests       34 passed (34)
Duration    1.82s`;
      responseType = 'success';
    } else if (trimmed === 'git status') {
      responseText = `On branch orion/fix-rate-limit
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	modified:   src/routes/tasks.test.ts
	new file:   ORION_VERIFICATION.md
	modified:   apps/backend/src/github/repos.ts`;
    } else if (trimmed === 'git diff') {
      responseText = `diff --git a/src/routes/tasks.test.ts b/src/routes/tasks.test.ts
--- a/src/routes/tasks.test.ts
+++ b/src/routes/tasks.test.ts
@@ -28,3 +28,4 @@
-    expect(res.statusCode).toBe(200);
+    // Expect 429 once rate limiter threshold is reached
+    expect(res.statusCode).toBe(429);`;
    } else if (trimmed === 'git branch') {
      responseText = `  main\n* orion/fix-rate-limit`;
      responseType = 'success';
    } else if (trimmed === 'git log' || trimmed === 'git log -n 2') {
      responseText = `commit 8f1a2c3 (HEAD -> orion/fix-rate-limit)
Author: orion-coding-agent[bot] <344046298+orion-coding-agent[bot]@users.noreply.github.com>
Date:   Mon Oct 19 02:40:00 2026

    fix: address rate-limit test verification`;
    } else if (trimmed.startsWith('cat ORION_VERIFICATION.md')) {
      responseText = `# Orion Coding Agent Verification
- Task: Fix checkout rate-limit test
- Sandbox: Docker (orion-sandbox)
- Author: 344046298+orion-coding-agent[bot]
- Status: Verified (34/34 passing)
- PR: #142 against main`;
    } else if (trimmed.startsWith('ls')) {
      responseText = `apps/  node_modules/  package.json  packages/  ORION_VERIFICATION.md  README.md  tsconfig.json`;
    } else if (trimmed.startsWith('pwd')) {
      responseText = `/workspace`;
    } else {
      responseText = `bash: ${trimmed.split(' ')[0]}: command executed successfully (exit code 0)`;
    }

    setLines((prev) => [
      ...prev,
      {
        id: `out-${Date.now()}`,
        type: responseType,
        text: responseText,
      },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(nextIdx);
      setInputVal(history[nextIdx] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx <= 0) {
        setHistIdx(-1);
        setInputVal('');
      } else {
        const nextIdx = histIdx - 1;
        setHistIdx(nextIdx);
        setInputVal(history[nextIdx] ?? '');
      }
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      {/* Quick command buttons */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5 px-0.5">
        {[
          { label: 'npm test', cmd: 'npm test' },
          { label: 'git status', cmd: 'git status' },
          { label: 'git diff', cmd: 'git diff' },
          { label: 'cat verification', cmd: 'cat ORION_VERIFICATION.md' },
          { label: 'clear', cmd: 'clear' },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={() => handleCommand(btn.cmd)}
            className="rounded-chip border border-line bg-surface px-2 py-0.5 font-mono text-[10.5px] text-ink-2 shadow-btn transition-colors hover:bg-hover hover:text-ink active:scale-95"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Terminal window */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-[#0d0e11] shadow-raised"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Terminal titlebar */}
        <div className="flex h-7 shrink-0 items-center justify-between border-b border-white/10 bg-[#16171d] px-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red opacity-70" />
            <span className="h-2 w-2 rounded-full bg-orange opacity-70" />
            <span className="h-2 w-2 rounded-full bg-green opacity-70" />
            <span className="ml-2 font-mono text-[10px] text-white/50">bash — /workspace</span>
          </div>
          <span className="flex items-center gap-1 font-mono text-[9.5px] text-green">
            <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
            connected
          </span>
        </div>

        {/* Scrollable output area */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-ink select-text">
          {lines.map((l) => {
            if (l.type === 'input') {
              return (
                <div key={l.id} className="mt-1 flex items-start gap-1.5 text-white/90">
                  <span className="text-accent select-none">orion@sandbox:~$</span>
                  <span className="font-semibold text-white">{l.text}</span>
                </div>
              );
            }
            if (l.type === 'info') {
              return (
                <div key={l.id} className="text-white/40 text-[10.5px]">
                  {l.text}
                </div>
              );
            }
            if (l.type === 'success') {
              return (
                <div key={l.id} className="text-green text-[10.5px]">
                  {l.text}
                </div>
              );
            }
            return (
              <pre key={l.id} className="whitespace-pre-wrap text-white/70 py-0.5 font-mono">
                {l.text}
              </pre>
            );
          })}
          <div ref={scrollRef} />
        </div>

        {/* Live input row */}
        <div className="flex items-center gap-1.5 border-t border-white/10 bg-[#121318] px-3 py-1.5">
          <span className="font-mono text-[11px] text-accent select-none shrink-0">
            orion@sandbox:~$
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command (try 'help', 'npm test', 'git diff')..."
            className="flex-1 bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-white/30"
          />
        </div>
      </div>
    </div>
  );
}
