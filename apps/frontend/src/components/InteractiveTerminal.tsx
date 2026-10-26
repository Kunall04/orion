import { useEffect, useRef, useState } from 'react';

export interface InteractiveTerminalProps {
  sessionId?: string;
  sandboxPort?: number;
  repo?: string;
}

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info';
  text: string;
}

export default function InteractiveTerminal({
  sessionId = 's1',
  sandboxPort,
  repo,
}: InteractiveTerminalProps) {
  const shortRepo = repo ? repo.split('/').pop() || repo : 'workspace';

  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 'init-1',
      type: 'info',
      text: `[orion] Connected to sandbox environment (session: ${sessionId})`,
    },
    {
      id: 'init-2',
      type: 'info',
      text: `[orion] Workspace: /workspace (port ${sandboxPort ?? 5001})`,
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Directly scroll the terminal container without affecting ancestor scroll offsets
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [lines, isExecuting]);

  // Listen to external terminal commands & clear events
  useEffect(() => {
    const handleCommandEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ command: string; output: string }>;
      if (!customEvent.detail) return;
      const { command, output } = customEvent.detail;
      setLines((prev) => [
        ...prev,
        { id: `in-${Date.now()}`, type: 'input', text: command },
        { id: `out-${Date.now()}`, type: 'output', text: output },
      ]);
    };

    const handleClearEvent = () => {
      setLines([]);
    };

    window.addEventListener('orion:terminal-command', handleCommandEvent);
    window.addEventListener('orion:terminal-clear', handleClearEvent);
    return () => {
      window.removeEventListener('orion:terminal-command', handleCommandEvent);
      window.removeEventListener('orion:terminal-clear', handleClearEvent);
    };
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
    <div
      className="flex h-full w-full flex-col bg-[#181818] font-mono text-[12px] select-text cursor-text overflow-hidden"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Scrollable terminal text output area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[12px] leading-relaxed text-[#cccccc] no-scrollbar"
      >
        {lines.map((l) => {
          if (l.type === 'input') {
            return (
              <div key={l.id} className="mt-1 flex items-start gap-2 text-white flex-nowrap whitespace-nowrap">
                <span className="flex items-center gap-1.5 select-none font-medium shrink-0 whitespace-nowrap">
                  <span className="text-[#38bdf8] truncate max-w-[130px]">~/{shortRepo}</span>
                  <span className="text-[#4ade80]">main</span>
                  <span className="text-[#e2e8f0] font-bold">&gt;</span>
                </span>
                <span className="font-semibold text-white whitespace-pre-wrap break-all">{l.text}</span>
              </div>
            );
          }
          if (l.type === 'info') {
            return (
              <div key={l.id} className="text-[#858585] text-[11px] leading-snug">
                {l.text}
              </div>
            );
          }
          if (l.type === 'success') {
            return (
              <div key={l.id} className="text-[#4ade80] text-[11.5px]">
                {l.text}
              </div>
            );
          }
          if (l.type === 'error') {
            return (
              <div key={l.id} className="text-[#f87171] text-[11.5px]">
                {l.text}
              </div>
            );
          }
          return (
            <pre key={l.id} className="whitespace-pre-wrap font-mono text-[11.5px] text-[#cccccc] py-0.5">
              {l.text}
            </pre>
          );
        })}

        {isExecuting && (
          <div className="flex items-center gap-2 py-1 text-[#858585] font-mono text-[11.5px]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
            Executing command in sandbox...
          </div>
        )}

        {/* Live input row sitting directly beneath last command */}
        <div className="flex items-center gap-2 pt-1 font-mono text-[12px] flex-nowrap whitespace-nowrap">
          <span className="flex items-center gap-1.5 select-none font-medium shrink-0 whitespace-nowrap">
            <span className="text-[#38bdf8] truncate max-w-[130px]">~/{shortRepo}</span>
            <span className="text-[#4ade80]">main</span>
            <span className="text-[#e2e8f0] font-bold">&gt;</span>
          </span>
          <input
            ref={inputRef}
            type="text"
            disabled={isExecuting}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-[60px] bg-transparent font-mono text-[12px] text-white outline-none caret-white"
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
