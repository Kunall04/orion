import { useEffect, useRef, useState } from 'react';

export interface InteractiveTerminalProps {
  sessionId?: string;
  sandboxPort?: number;
}

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info';
  text: string;
}

export default function InteractiveTerminal({
  sessionId = 's1',
  sandboxPort,
}: InteractiveTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: 'init-1', type: 'info', text: `Orion Sandbox Environment (session: ${sessionId})` },
    {
      id: 'init-2',
      type: 'success',
      text: `✓ Connected to sandbox container (workspace: /workspace, port: ${sandboxPort ?? 5001})`,
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ command: string; output: string }>;
      if (!customEvent.detail) return;
      const { command, output } = customEvent.detail;
      setLines((prev) => [
        ...prev,
        { id: `in-${Date.now()}`, type: 'input', text: command },
        { id: `out-${Date.now()}`, type: 'output', text: output },
      ]);
    };

    window.addEventListener('orion:terminal-command', handler);
    return () => window.removeEventListener('orion:terminal-command', handler);
  }, []);

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

    if (trimmed === 'help') {
      setLines((prev) => [
        ...prev,
        {
          id: `out-${Date.now()}`,
          type: 'info',
          text: `Available commands:
  npm test           Run Vitest test suite
  npm run dev        Start local dev server on port 3000
  git status         Check working tree status
  git diff           Show unstaged / staged changes
  ls -la             List directory files
  pwd                Print current working directory
  clear              Clear terminal screen`,
        },
      ]);
      return;
    }

    setIsExecuting(true);
    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed, sessionId }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setLines((prev) => [
          ...prev,
          {
            id: `out-${Date.now()}`,
            type: 'output',
            text: data.output || '(command executed with no output)',
          },
        ]);
      } else {
        setLines((prev) => [
          ...prev,
          {
            id: `out-${Date.now()}`,
            type: 'error',
            text: data.error || `Command failed with HTTP ${res.status}`,
          },
        ]);
      }
    } catch (err: any) {
      setLines((prev) => [
        ...prev,
        {
          id: `out-${Date.now()}`,
          type: 'error',
          text: `Connection error: ${err.message}`,
        },
      ]);
    } finally {
      setIsExecuting(false);
    }
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
          { label: 'npm run dev', cmd: 'npm run dev' },
          { label: 'git status', cmd: 'git status' },
          { label: 'git diff', cmd: 'git diff' },
          { label: 'ls -la', cmd: 'ls -la' },
          { label: 'clear', cmd: 'clear' },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            disabled={isExecuting}
            onClick={() => handleCommand(btn.cmd)}
            className="rounded-chip border border-line bg-surface px-2 py-0.5 font-mono text-[10.5px] text-ink-2 shadow-btn transition-colors hover:bg-hover hover:text-ink active:scale-95 disabled:opacity-50"
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
            if (l.type === 'error') {
              return (
                <div key={l.id} className="text-red text-[10.5px]">
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
          {isExecuting && (
            <div className="flex items-center gap-1.5 py-1 text-white/40 font-mono text-[10.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
              Executing command in sandbox...
            </div>
          )}
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
            disabled={isExecuting}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isExecuting ? "Executing..." : "Type command (e.g. 'npm test', 'npm run dev', 'git status')..."}
            className="flex-1 bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-white/30 disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
