import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

export interface TabFile {
  name: string;
  path: string;
  lang: string;
  content: string;
  modified?: boolean;
  isWelcome?: boolean;
}

export const DEFAULT_FILES: TabFile[] = [
  {
    name: '✨ Orion IDE',
    path: 'welcome',
    lang: 'plaintext',
    isWelcome: true,
    content: '',
  },
];

export interface VSCodeIDEProps {
  files?: TabFile[];
  sessionId?: string;
  sandboxPort?: number;
  onOpenTerminalTab?: () => void;
}

type ActivityTab = 'explorer' | 'search' | 'git' | 'debug' | 'extensions';

export default function VSCodeIDE({
  files = DEFAULT_FILES,
  sessionId = 's1',
  sandboxPort,
  onOpenTerminalTab,
}: VSCodeIDEProps) {
  const [openFiles, setOpenFiles] = useState<TabFile[]>(files);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const monacoEditorRef = useRef<any>(null);

  useEffect(() => {
    if (files && files.length > 0) {
      setOpenFiles(files);
      setActiveFileIdx((prev) => {
        const currentPath = openFiles[prev]?.path;
        if (currentPath) {
          const match = files.findIndex((f) => f.path === currentPath);
          if (match !== -1) return match;
        }
        return prev < files.length ? prev : 0;
      });
      setTimeout(() => {
        monacoEditorRef.current?.layout();
      }, 50);
    }
  }, [files]);

  const activeFile = openFiles[activeFileIdx] || openFiles[0] || DEFAULT_FILES[0]!;

  // Activity bar state
  const [activeActivity, setActiveActivity] = useState<ActivityTab | null>(null);

  // Lazy-load file content from sandbox if not already loaded
  const handleSelectFile = async (idx: number) => {
    setActiveFileIdx(idx);
    const target = openFiles[idx];
    if (target && !target.isWelcome && !target.content && sessionId) {
      setIsLoadingFile(true);
      try {
        const res = await fetch(`/sessions/${sessionId}/file?path=${encodeURIComponent(target.path)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && typeof data.content === 'string') {
            setOpenFiles((prev) =>
              prev.map((f, i) => (i === idx ? { ...f, content: data.content } : f))
            );
          }
        }
      } catch {} finally {
        setIsLoadingFile(false);
      }
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const val = value ?? '';
    setOpenFiles((prev) =>
      prev.map((f, i) => (i === activeFileIdx ? { ...f, content: val, modified: true } : f))
    );
  };

  const handleSaveFile = async () => {
    if (!activeFile || activeFile.isWelcome || !sessionId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/sessions/${sessionId}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeFile.path,
          content: activeFile.content,
        }),
      });
      if (res.ok) {
        setOpenFiles((prev) =>
          prev.map((f, i) => (i === activeFileIdx ? { ...f, modified: false } : f))
        );
      }
    } catch {} finally {
      setIsSaving(false);
    }
  };

  const closeTab = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (openFiles.length <= 1) return;
    const nextFiles = openFiles.filter((_, i) => i !== idx);
    setOpenFiles(nextFiles);
    if (activeFileIdx >= nextFiles.length) {
      setActiveFileIdx(Math.max(0, nextFiles.length - 1));
    }
  };

  const getFileIcon = (file: TabFile) => {
    if (file.isWelcome) return '✨';
    if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) {
      return <span className="font-bold text-[#3178c6] text-[10px]">TS</span>;
    }
    if (file.path.endsWith('.js') || file.path.endsWith('.jsx')) {
      return <span className="font-bold text-[#f7df1e] text-[10px]">JS</span>;
    }
    if (file.path.endsWith('.json')) {
      return <span className="font-bold text-[#fbc02d] text-[10px]">&#123;&#125;</span>;
    }
    if (file.path.endsWith('.md')) {
      return <span className="font-bold text-[#42a5f5] text-[10px]">M↓</span>;
    }
    return <span className="text-[#a0a0a0] text-[10px]">📄</span>;
  };

  return (
    <div className="flex h-full w-full select-none overflow-hidden bg-[#1e1e1e] font-sans text-white">
      {/* ── VS Code Left Activity Bar ── */}
      <aside className="flex w-[48px] shrink-0 flex-col items-center justify-between border-r border-[#262626] bg-[#333333] py-2 text-[#858585]">
        {/* Top Activity Icons */}
        <div className="flex flex-col items-center gap-2">
          {/* Explorer */}
          <button
            type="button"
            title="Explorer (⌘⇧E)"
            onClick={() => setActiveActivity((prev) => (prev === 'explorer' ? null : 'explorer'))}
            className={`relative flex h-9 w-9 items-center justify-center rounded transition-colors ${
              activeActivity === 'explorer' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'explorer' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
          </button>

          {/* Search */}
          <button
            type="button"
            title="Search (⌘⇧F)"
            onClick={() => setActiveActivity((prev) => (prev === 'search' ? null : 'search'))}
            className={`relative flex h-9 w-9 items-center justify-center rounded transition-colors ${
              activeActivity === 'search' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'search' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* Source Control */}
          <button
            type="button"
            title="Source Control (⌃⇧G)"
            onClick={() => setActiveActivity((prev) => (prev === 'git' ? null : 'git'))}
            className={`relative flex h-9 w-9 items-center justify-center rounded transition-colors ${
              activeActivity === 'git' ? 'text-white' : 'hover:text-[#cccccc]'
            }`}
          >
            {activeActivity === 'git' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-white rounded-r" />
            )}
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
            </svg>
          </button>
        </div>

        {/* Bottom Activity Icons */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            title="Manage Settings"
            className="flex h-8 w-8 items-center justify-center rounded hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83 0 2 2 0 0 1 0 2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Optional Explorer Drawer ── */}
      {activeActivity === 'explorer' && (
        <div className="flex w-[180px] shrink-0 flex-col border-r border-[#262626] bg-[#252526] text-[12px]">
          <div className="flex h-[35px] items-center justify-between px-3 font-semibold uppercase tracking-wider text-[#bbbbbb] border-b border-[#181818]">
            <span>Workspace</span>
            <button
              type="button"
              onClick={() => setActiveActivity(null)}
              className="text-[#858585] hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col p-1.5 gap-0.5 font-mono text-[11px] overflow-y-auto">
            <span className="font-semibold text-accent px-1.5 py-0.5 text-[10px] uppercase">
              Sandbox Files
            </span>
            {openFiles
              .filter((f) => !f.isWelcome)
              .map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => {
                    const idx = openFiles.findIndex((f) => f.path === file.path);
                    if (idx !== -1) handleSelectFile(idx);
                  }}
                  className={`flex items-center gap-1.5 rounded px-2 py-1 text-left ${
                    openFiles[activeFileIdx]?.path === file.path
                      ? 'bg-[#37373d] text-white font-medium'
                      : 'text-[#969696] hover:bg-[#2a2d2e] hover:text-[#cccccc]'
                  }`}
                >
                  {getFileIcon(file)}
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            {openFiles.filter((f) => !f.isWelcome).length === 0 && (
              <div className="p-2 text-[#777777] text-[10.5px]">No workspace files loaded yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Main Editor Column ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── VS Code Tab Bar ── */}
        <div className="flex h-[35px] shrink-0 items-center justify-between overflow-x-auto bg-[#252526] border-b border-[#181818]">
          <div className="flex h-full items-center">
            {openFiles.map((file, idx) => {
              const isActive = idx === activeFileIdx;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => handleSelectFile(idx)}
                  className={`group flex h-full items-center gap-2 border-r border-[#181818] px-3 text-[12px] font-mono transition-colors ${
                    isActive
                      ? 'bg-[#1e1e1e] text-white border-t border-t-accent'
                      : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#1e1e1e]/60 hover:text-[#cccccc]'
                  }`}
                >
                  {getFileIcon(file)}
                  <span className="truncate max-w-[130px]">{file.name}</span>
                  {file.modified && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  {openFiles.length > 1 && (
                    <span
                      onClick={(e) => closeTab(e, idx)}
                      className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[#444444]"
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action buttons (Save, Format) */}
          {!activeFile.isWelcome && (
            <div className="flex items-center gap-2 px-3">
              {activeFile.modified && (
                <button
                  type="button"
                  onClick={handleSaveFile}
                  disabled={isSaving}
                  className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[10px] text-accent hover:bg-accent/30 transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save File (⌘S)'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Breadcrumb Bar ── */}
        <div className="flex h-[22px] shrink-0 items-center gap-1.5 border-b border-[#252526] bg-[#1e1e1e] px-4 font-mono text-[11px] text-[#888888]">
          <span>workspace</span>
          <span>&gt;</span>
          <span className="text-[#cccccc]">{activeFile.path}</span>
        </div>

        {/* ── Monaco Editor Workspace Area ── */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e]">
          {isLoadingFile ? (
            <div className="flex h-full items-center justify-center text-[#888888] font-mono text-xs gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Loading file from sandbox workspace...
            </div>
          ) : activeFile.isWelcome ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[#cccccc]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#252526] text-accent text-2xl shadow-card border border-[#333333] mb-4">
                ✨
              </div>
              <h2 className="text-lg font-semibold text-white">Orion Sandbox IDE</h2>
              <p className="mt-1 max-w-md text-xs text-[#888888] leading-relaxed">
                Connected to sandbox workspace. Open files from the workspace explorer or run commands in the unified Terminal.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveActivity('explorer')}
                  className="rounded-chip border border-[#444444] bg-[#252526] px-3 py-1 font-mono text-[11px] text-white hover:bg-[#333333] transition-colors"
                >
                  Browse Files
                </button>
                <button
                  type="button"
                  onClick={onOpenTerminalTab}
                  className="rounded-chip border border-accent bg-accent/15 px-3 py-1 font-mono text-[11px] text-accent hover:bg-accent/25 transition-colors"
                >
                  Open Terminal
                </button>
              </div>
            </div>
          ) : (
            <Editor
              height="100%"
              path={activeFile.path}
              language={activeFile.lang}
              value={activeFile.content}
              theme="vs-dark"
              onChange={handleEditorChange}
              onMount={(editor) => {
                monacoEditorRef.current = editor;
              }}
              options={{
                fontSize: 12.5,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                tabSize: 2,
                minimap: { enabled: true, maxColumn: 60 },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
              }}
            />
          )}
        </div>

        {/* ── Bottom Terminal Launch Bar ── */}
        <div className="flex h-6 shrink-0 items-center justify-between border-t border-[#333333] bg-[#1e1e1e] px-3 font-mono text-[10px] text-[#858585]">
          <button
            type="button"
            onClick={onOpenTerminalTab}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <span>▲ TERMINAL</span>
            <span className="text-green font-semibold">● connected to sandbox</span>
          </button>
          <span className="text-[9.5px] text-[#666666]">
            Session: {sessionId} (port {sandboxPort ?? 5001})
          </span>
        </div>

        {/* ── Status Bar ── */}
        <div className="flex h-5 shrink-0 items-center justify-between bg-[#007acc] px-2 font-mono text-[10px] text-white">
          <div className="flex items-center gap-2">
            <span>⎇ sandbox/workspace</span>
            <span>✓ 0 errors</span>
          </div>
          <div className="flex items-center gap-3">
            <span>UTF-8</span>
            <span>{activeFile.lang.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
