import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import InteractiveTerminal from './InteractiveTerminal';
import {
  buildFileTree,
  getDefaultExpandedDirs,
  getFileMeta,
  type FileTreeNode,
} from '../utils/fileTree';
import { stripCorruptLineNumbers } from '../utils/fileContent';
export { stripCorruptLineNumbers };

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
  repo?: string;
}

type ActivityTab = 'explorer' | 'search' | 'git';
type BottomPanelTab = 'terminal' | 'problems' | 'output' | 'debug' | 'ports';

export default function VSCodeIDE({
  files = DEFAULT_FILES,
  sessionId = 's1',
  sandboxPort,
  repo,
}: VSCodeIDEProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // All workspace files
  const [workspaceFiles, setWorkspaceFiles] = useState<TabFile[]>(() =>
    files.map((f) => ({ ...f, content: stripCorruptLineNumbers(f.content) }))
  );

  // Open tabs in the editor
  const [openTabs, setOpenTabs] = useState<TabFile[]>(() => {
    const welcome = files.find((f) => f.isWelcome) || DEFAULT_FILES[0]!;
    const firstCodeFile = files.find((f) => !f.isWelcome);
    return firstCodeFile
      ? [{ ...firstCodeFile, content: stripCorruptLineNumbers(firstCodeFile.content) }]
      : [welcome];
  });
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // Tree directory expansion state
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [hasInitializedExpandedDirs, setHasInitializedExpandedDirs] = useState(false);

  // Activity Bar & Sidebar state (toggable anytime by clicking icon)
  const [activeActivity, setActiveActivity] = useState<ActivityTab | null>('explorer');
  const [openEditorsExpanded, setOpenEditorsExpanded] = useState(true);
  const [projectRootExpanded, setProjectRootExpanded] = useState(true);

  // Configure Monaco TypeScript/JSX options to suppress false-positive semantic errors
  // for browser-only environment (e.g. missing node_modules/@types/react or missing JSX runtime)
  const handleBeforeMount = useCallback((monaco: any) => {
    if (!monaco?.languages?.typescript) return;

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTextExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      reactNamespace: 'React',
      allowJs: true,
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
  }, []);

  // Search filter
  const [searchFilter, setSearchFilter] = useState('');

  // Inline new file creation
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Integrated Bottom Panel state
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('terminal');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(190);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const panelDragStartY = useRef(0);
  const panelStartHeight = useRef(190);

  // Monaco Editor state
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const monacoEditorRef = useRef<any>(null);

  // ResizeObserver to update width and trigger Monaco layout dynamically
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      setContainerWidth(w);
      requestAnimationFrame(() => {
        monacoEditorRef.current?.layout();
      });
    });

    observer.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  // Sync workspaceFiles when prop changes
  useEffect(() => {
    if (files && files.length > 0) {
      setWorkspaceFiles(files.map((f) => ({ ...f, content: stripCorruptLineNumbers(f.content) })));

      const tree = buildFileTree(files);
      if (!hasInitializedExpandedDirs && tree.length > 0) {
        const defaultExpanded = getDefaultExpandedDirs(tree, 2);
        setExpandedDirs(defaultExpanded);
        setHasInitializedExpandedDirs(true);
      }

      setOpenTabs((prev) => {
        if (prev.length === 1 && prev[0]?.isWelcome) {
          const mainFile =
            files.find((f) => f.path.includes('App') || f.path.includes('index') || f.path.includes('main')) ||
            files.find((f) => !f.isWelcome);
          if (mainFile) {
            return [{ ...mainFile, content: stripCorruptLineNumbers(mainFile.content) }];
          }
        }
        return prev;
      });
    }
  }, [files, hasInitializedExpandedDirs]);

  const activeTab = openTabs[activeTabIdx] || openTabs[0] || DEFAULT_FILES[0]!;

  // Load content for active file if not present
  useEffect(() => {
    if (activeTab && !activeTab.isWelcome && !activeTab.content && sessionId) {
      let cancelled = false;
      setIsLoadingFile(true);
      fetch(`/sessions/${sessionId}/file?path=${encodeURIComponent(activeTab.path)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.ok && typeof data.content === 'string') {
            const cleanContent = stripCorruptLineNumbers(data.content);
            setOpenTabs((prev) =>
              prev.map((f, i) => (i === activeTabIdx ? { ...f, content: cleanContent } : f))
            );
            setWorkspaceFiles((prev) =>
              prev.map((f) => (f.path === activeTab.path ? { ...f, content: cleanContent } : f))
            );
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsLoadingFile(false);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [activeTab?.path, sessionId]);

  const handleOpenFile = useCallback((targetFile: TabFile) => {
    const cleanTarget = {
      ...targetFile,
      content: stripCorruptLineNumbers(targetFile.content),
    };
    const existingIdx = openTabs.findIndex((t) => t.path === cleanTarget.path);
    if (existingIdx !== -1) {
      setActiveTabIdx(existingIdx);
    } else if (openTabs.length === 1 && openTabs[0]?.isWelcome) {
      setOpenTabs([cleanTarget]);
      setActiveTabIdx(0);
    } else {
      setOpenTabs((prev) => {
        const next = [...prev, cleanTarget];
        setActiveTabIdx(next.length - 1);
        return next;
      });
    }
    setTimeout(() => monacoEditorRef.current?.layout(), 60);
  }, [openTabs]);

  const handleCloseTab = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (openTabs.length <= 1) {
      setOpenTabs([DEFAULT_FILES[0]!]);
      setActiveTabIdx(0);
      return;
    }
    const nextTabs = openTabs.filter((_, i) => i !== idx);
    setOpenTabs(nextTabs);
    setActiveTabIdx((prev) => (prev >= nextTabs.length ? Math.max(0, nextTabs.length - 1) : prev));
  };

  const handleEditorChange = (value: string | undefined) => {
    setOpenTabs((prev) =>
      prev.map((f, i) => (i === activeTabIdx ? { ...f, content: value ?? '', modified: true } : f))
    );
  };

  const handleSaveFile = async () => {
    if (!activeTab || activeTab.isWelcome || !sessionId) return;
    setIsSaving(true);
    const cleanContent = stripCorruptLineNumbers(activeTab.content);
    try {
      const res = await fetch(`/sessions/${sessionId}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeTab.path, content: cleanContent }),
      });
      if (res.ok) {
        setOpenTabs((prev) =>
          prev.map((f, i) => (i === activeTabIdx ? { ...f, content: cleanContent, modified: false } : f))
        );
      }
    } catch {} finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewFile = async () => {
    const clean = newFileName.trim();
    if (!clean || !sessionId) {
      setIsCreatingFile(false);
      setNewFileName('');
      return;
    }
    try {
      const meta = getFileMeta(clean);
      const res = await fetch(`/sessions/${sessionId}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: clean, content: '' }),
      });
      if (res.ok) {
        const newFile: TabFile = {
          name: clean.split('/').pop() || clean,
          path: clean,
          lang: meta.lang,
          content: '',
        };
        setWorkspaceFiles((prev) => [...prev, newFile]);
        handleOpenFile(newFile);
      }
    } catch {} finally {
      setIsCreatingFile(false);
      setNewFileName('');
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        setIsBottomPanelOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, sessionId]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      next.has(dirPath) ? next.delete(dirPath) : next.add(dirPath);
      return next;
    });
  };

  const handleRefreshFiles = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/sessions/${sessionId}/files`);
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.files)) {
          setWorkspaceFiles(
            data.files.map((p: string) => {
              const meta = getFileMeta(p);
              return { name: p.split('/').pop() || p, path: p, lang: meta.lang, content: '' };
            })
          );
        }
      }
    } catch {}
  };

  const startPanelResize = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizingPanel(true);
    panelDragStartY.current = e.clientY;
    panelStartHeight.current = bottomPanelHeight;

    const onPointerMove = (ev: PointerEvent) => {
      const delta = panelDragStartY.current - ev.clientY;
      setBottomPanelHeight(Math.max(90, Math.min(panelStartHeight.current + delta, 480)));
      monacoEditorRef.current?.layout();
    };
    const onPointerUp = () => {
      setIsResizingPanel(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setTimeout(() => monacoEditorRef.current?.layout(), 60);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const fileTree = buildFileTree(workspaceFiles);
  const displayRepoName = repo ? repo.split('/').pop() || repo : 'workspace';

  const renderTreeNodes = (nodes: FileTreeNode[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const isExpanded = expandedDirs.has(node.path);
      const isSelected = !node.isDir && activeTab.path === node.path;
      const paddingLeft = depth * 14 + 10;

      if (node.isDir) {
        return (
          <div key={node.id} className="flex flex-col select-none whitespace-nowrap">
            <button
              type="button"
              onClick={() => toggleDir(node.path)}
              className="group relative flex h-[22px] w-full items-center gap-1.5 text-left text-[12px] text-[#cccccc] hover:bg-[#2a2d2e] transition-colors whitespace-nowrap overflow-hidden"
              style={{ paddingLeft: `${paddingLeft}px` }}
            >
              {depth > 0 &&
                Array.from({ length: depth }).map((_, i) => (
                  <span
                    key={i}
                    className="absolute top-0 bottom-0 w-[1px] bg-[#333333] group-hover:bg-[#444444]"
                    style={{ left: `${i * 14 + 14}px` }}
                  />
                ))}
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[#858585] group-hover:text-white">
                {isExpanded ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </span>
              <span className="text-[#dcb67a] shrink-0">
                {isExpanded ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1h-14v9h16V9a2 2 0 0 0-2-2z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                  </svg>
                )}
              </span>
              <span className="truncate font-sans font-medium text-[12px]">{node.name}</span>
            </button>
            {isExpanded && node.children.length > 0 && renderTreeNodes(node.children, depth + 1)}
          </div>
        );
      }

      const meta = getFileMeta(node.name);
      return (
        <div key={node.id} className="relative flex select-none whitespace-nowrap overflow-hidden">
          {depth > 0 &&
            Array.from({ length: depth }).map((_, i) => (
              <span
                key={i}
                className="pointer-events-none absolute top-0 bottom-0 w-[1px] bg-[#333333]"
                style={{ left: `${i * 14 + 14}px` }}
              />
            ))}
          <button
            type="button"
            onClick={() => node.file && handleOpenFile(node.file)}
            className={`group flex h-[22px] w-full items-center gap-1.5 text-left text-[12px] transition-colors whitespace-nowrap overflow-hidden ${
              isSelected ? 'bg-[#37373d] text-white font-medium' : 'text-[#969696] hover:bg-[#2a2d2e] hover:text-[#cccccc]'
            }`}
            style={{ paddingLeft: `${paddingLeft + 16}px` }}
          >
            <span className="flex h-3.5 w-4 shrink-0 items-center justify-center font-mono text-[9.5px] font-bold" style={{ color: meta.color }}>
              {meta.badge}
            </span>
            <span className="truncate font-sans text-[12px]">{node.name}</span>
          </button>
        </div>
      );
    });
  };

  const breadcrumbSegments = activeTab.isWelcome
    ? ['welcome']
    : [displayRepoName, ...activeTab.path.split('/').filter(Boolean)];

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full select-none overflow-hidden bg-[#1e1e1e] font-sans text-white"
    >
      {/* ── 1. Activity Bar (48px) ── */}
      <aside className="flex w-[48px] shrink-0 flex-col items-center justify-between border-r border-[#252526] bg-[#333333] py-2 text-[#858585]">
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
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            {openTabs.some((t) => t.modified) && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        </div>

        {/* Settings gear */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            title="Settings"
            className="flex h-8 w-8 items-center justify-center rounded hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83 0 2 2 0 0 1 0 2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── 2. Primary Side Bar (200px compact width) ── */}
      {activeActivity !== null && (
        <div className="flex w-[200px] shrink-0 flex-col border-r border-[#252526] bg-[#252526] text-[12px] font-sans overflow-hidden">
          {/* Explorer View */}
          {activeActivity === 'explorer' && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex h-[35px] shrink-0 items-center justify-between px-3 uppercase tracking-wider text-[#bbbbbb]">
                <span className="text-[11px] font-bold">Explorer</span>
                <div className="flex items-center gap-1 text-[#858585]">
                  <button
                    type="button"
                    title="New File..."
                    onClick={() => setIsCreatingFile(true)}
                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#333333] hover:text-white transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Refresh"
                    onClick={handleRefreshFiles}
                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#333333] hover:text-white transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Collapse Folders"
                    onClick={() => setExpandedDirs(new Set())}
                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#333333] hover:text-white transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="4" y1="7" x2="20" y2="7" />
                      <line x1="4" y1="17" x2="20" y2="17" />
                      <polyline points="10 11 12 13 14 11" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4 no-scrollbar">
                {/* OPEN EDITORS */}
                <div className="flex flex-col border-t border-[#1e1e1e]">
                  <button
                    type="button"
                    onClick={() => setOpenEditorsExpanded((p) => !p)}
                    className="flex h-[24px] items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb] hover:text-white transition-colors"
                  >
                    <span className="text-[#858585]">{openEditorsExpanded ? '▾' : '▸'}</span>
                    <span>Open Editors</span>
                    <span className="ml-auto text-[10px] text-[#666666]">
                      {openTabs.filter((t) => !t.isWelcome).length}
                    </span>
                  </button>
                  {openEditorsExpanded && (
                    <div className="flex flex-col py-0.5">
                      {openTabs.map((tab, idx) => {
                        const meta = getFileMeta(tab.name);
                        const isCurrent = idx === activeTabIdx;
                        return (
                          <div
                            key={tab.path}
                            onClick={() => setActiveTabIdx(idx)}
                            className={`group flex h-[22px] items-center justify-between px-3 text-[12px] cursor-pointer ${
                              isCurrent
                                ? 'bg-[#37373d] text-white font-medium'
                                : 'text-[#969696] hover:bg-[#2a2d2e] hover:text-[#cccccc]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center font-mono text-[9.5px] font-bold"
                                style={{ color: meta.color }}
                              >
                                {meta.badge}
                              </span>
                              <span className="truncate">{tab.name}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {tab.modified && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                              <button
                                type="button"
                                onClick={(e) => handleCloseTab(e, idx)}
                                title="Close"
                                className="rounded p-0.5 text-[#858585] opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* PROJECT ROOT TREE */}
                <div className="flex flex-col border-t border-[#1e1e1e] mt-1">
                  <button
                    type="button"
                    onClick={() => setProjectRootExpanded((p) => !p)}
                    className="flex h-[24px] items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb] hover:text-white transition-colors"
                  >
                    <span className="text-[#858585]">{projectRootExpanded ? '▾' : '▸'}</span>
                    <span className="truncate">{displayRepoName.toUpperCase()}</span>
                  </button>
                  {projectRootExpanded && (
                    <div className="flex flex-col pt-0.5">
                      {isCreatingFile && (
                        <div className="flex items-center gap-1.5 px-4 py-1 bg-[#1e1e1e]">
                          <span className="text-[10px] text-[#858585]">📄</span>
                          <input
                            autoFocus
                            type="text"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateNewFile();
                              if (e.key === 'Escape') {
                                setIsCreatingFile(false);
                                setNewFileName('');
                              }
                            }}
                            onBlur={handleCreateNewFile}
                            placeholder="file.ts"
                            className="w-full bg-[#3c3c3c] px-1.5 py-0.5 text-[11px] text-white outline-none border border-accent"
                          />
                        </div>
                      )}
                      {fileTree.length > 0 ? (
                        renderTreeNodes(fileTree, 0)
                      ) : (
                        <div className="p-3 text-[#777777] text-[11px]">No workspace files loaded.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Search View */}
          {activeActivity === 'search' && (
            <div className="flex h-full flex-col p-3 gap-2 overflow-hidden">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb]">Search</span>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search files by name..."
                className="w-full rounded bg-[#3c3c3c] px-2.5 py-1 text-[11.5px] text-white outline-none border border-transparent focus:border-accent"
              />
              <div className="flex flex-col gap-0.5 mt-2 overflow-y-auto no-scrollbar">
                {workspaceFiles
                  .filter((f) => !f.isWelcome && f.path.toLowerCase().includes(searchFilter.toLowerCase()))
                  .map((f) => {
                    const meta = getFileMeta(f.name);
                    return (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => handleOpenFile(f)}
                        className="flex items-center gap-2 rounded px-2 py-1 text-left text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
                      >
                        <span className="font-mono text-[9px] font-bold shrink-0" style={{ color: meta.color }}>
                          {meta.badge}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[12px]">{f.name}</span>
                          <span className="truncate text-[10px] text-[#666666]">{f.path}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Git View */}
          {activeActivity === 'git' && (
            <div className="flex h-full flex-col p-3 gap-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb]">Source Control</span>
                <span className="rounded bg-[#333333] px-1.5 py-0.2 font-mono text-[10px] text-white">
                  {openTabs.filter((t) => t.modified).length}
                </span>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto no-scrollbar">
                <span className="text-[10.5px] font-semibold text-[#858585] uppercase">Changes</span>
                {openTabs
                  .filter((t) => t.modified)
                  .map((t) => (
                    <div
                      key={t.path}
                      onClick={() => {
                        const idx = openTabs.findIndex((f) => f.path === t.path);
                        if (idx !== -1) setActiveTabIdx(idx);
                      }}
                      className="flex items-center justify-between rounded px-2 py-1 text-[12px] text-accent hover:bg-[#2a2d2e] cursor-pointer"
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="text-[10px] text-accent font-bold shrink-0 ml-1">M</span>
                    </div>
                  ))}
                {!openTabs.some((t) => t.modified) && (
                  <div className="py-2 text-[11px] text-[#666666]">No changes in open tabs.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. Main Editor Column ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── 3A. Tab Bar ── */}
        <div className="flex h-[35px] shrink-0 items-center justify-between bg-[#252526] border-b border-[#181818] overflow-hidden whitespace-nowrap">
          <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto no-scrollbar whitespace-nowrap">
            {openTabs.map((file, idx) => {
              const isActive = idx === activeTabIdx;
              const meta = getFileMeta(file.name);
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setActiveTabIdx(idx)}
                  className={`group flex h-full shrink-0 items-center gap-1.5 border-r border-[#181818] px-3 font-sans text-[12px] whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-[#1e1e1e] text-white border-t-2 border-t-accent'
                      : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#1e1e1e]/60 hover:text-[#cccccc]'
                  }`}
                >
                  <span className="font-mono text-[9.5px] font-bold shrink-0" style={{ color: meta.color }}>
                    {meta.badge}
                  </span>
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  {file.modified && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  <span
                    onClick={(e) => handleCloseTab(e, idx)}
                    className="ml-1 rounded p-0.5 text-[#858585] opacity-0 group-hover:opacity-100 hover:text-white shrink-0"
                  >
                    ✕
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 px-2 text-[#858585] whitespace-nowrap">
            {activeTab.modified && (
              <button
                type="button"
                onClick={handleSaveFile}
                disabled={isSaving}
                className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[10px] text-accent hover:bg-accent/30 transition-colors whitespace-nowrap"
              >
                {isSaving ? 'Saving…' : '⌘S Save'}
              </button>
            )}
            <button
              type="button"
              title="Toggle Terminal (⌃`)"
              onClick={() => setIsBottomPanelOpen((p) => !p)}
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-[#333333] transition-colors shrink-0 ${
                isBottomPanelOpen ? 'text-white' : 'text-[#858585]'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── 3B. Breadcrumbs Bar ── */}
        <div className="flex h-[22px] shrink-0 items-center gap-1 border-b border-[#252526] bg-[#1e1e1e] px-3 font-sans text-[11px] text-[#888888] overflow-hidden whitespace-nowrap">
          {breadcrumbSegments.map((segment, i) => {
            const isLast = i === breadcrumbSegments.length - 1;
            return (
              <div key={i} className="flex items-center gap-1 min-w-0 shrink whitespace-nowrap">
                {i > 0 && <span className="text-[#555555] shrink-0">&gt;</span>}
                <span className={`truncate ${isLast ? 'font-medium text-[#cccccc]' : ''}`}>{segment}</span>
              </div>
            );
          })}
        </div>

        {/* ── 3C. Monaco Code Editor Workspace ── */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e]">
          {isLoadingFile ? (
            <div className="flex h-full items-center justify-center text-[#888888] font-mono text-xs gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Loading file…
            </div>
          ) : activeTab.isWelcome ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[#cccccc]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#252526] text-accent text-2xl shadow-card border border-[#333333] mb-4">
                ✨
              </div>
              <h2 className="text-lg font-semibold text-white">Orion Sandbox IDE</h2>
              <p className="mt-1 max-w-md text-xs text-[#888888] leading-relaxed">
                Explore files from the Explorer on the left, edit code with full syntax highlighting, or run commands in
                the integrated Terminal panel below.
              </p>
              <div className="mt-5 flex items-center gap-3 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => setActiveActivity('explorer')}
                  className="rounded-chip border border-[#444444] bg-[#252526] px-3 py-1 font-mono text-[11px] text-white hover:bg-[#333333] transition-colors"
                >
                  Open Explorer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsBottomPanelOpen(true);
                    setBottomPanelTab('terminal');
                  }}
                  className="rounded-chip border border-accent bg-accent/15 px-3 py-1 font-mono text-[11px] text-accent hover:bg-accent/25 transition-colors"
                >
                  Open Terminal
                </button>
              </div>
            </div>
          ) : (
            <Editor
              height="100%"
              path={activeTab.path}
              language={activeTab.lang}
              value={stripCorruptLineNumbers(activeTab.content)}
              theme="vs-dark"
              beforeMount={handleBeforeMount}
              onChange={handleEditorChange}
              onMount={(editor) => {
                monacoEditorRef.current = editor;
                editor.onDidChangeCursorPosition((e: any) => {
                  setCursorPos({ line: e.position.lineNumber, col: e.position.column });
                });
                // Unfold all code sections so no lines are hidden by folded blocks
                editor.getAction('editor.unfoldAll')?.run();
              }}
              options={{
                fontSize: 12.5,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                tabSize: 2,
                minimap: { enabled: containerWidth > 720, maxColumn: 40 },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                lineDecorationsWidth: 4,
                glyphMargin: true,
                folding: true,
                showFoldingControls: 'always',
                renderLineHighlight: 'all',
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
              }}
            />
          )}
        </div>

        {/* ── 3D. Integrated Resizable Bottom Panel ── */}
        {isBottomPanelOpen && (
          <div
            style={{ height: bottomPanelHeight }}
            className="relative flex flex-col shrink-0 border-t border-[#333333] bg-[#181818] overflow-hidden"
          >
            {/* Drag-to-resize handle */}
            <div
              onPointerDown={startPanelResize}
              className={`absolute -top-1 left-0 right-0 z-10 h-2 cursor-row-resize select-none ${
                isResizingPanel ? 'bg-accent/30' : 'hover:bg-accent/20'
              }`}
            />

            {/* Panel Tab Bar */}
            <div className="flex h-[32px] shrink-0 items-center justify-between border-b border-[#252526] bg-[#181818] px-3 overflow-hidden whitespace-nowrap">
              <div className="flex h-full min-w-0 items-center gap-3 text-[11.5px] font-sans overflow-x-auto no-scrollbar whitespace-nowrap">
                {(['problems', 'output', 'debug', 'terminal', 'ports'] as BottomPanelTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBottomPanelTab(t)}
                    className={`flex h-full shrink-0 items-center gap-1.5 capitalize transition-colors whitespace-nowrap ${
                      bottomPanelTab === t
                        ? 'border-b-2 border-white text-white font-medium'
                        : 'text-[#858585] hover:text-[#cccccc]'
                    }`}
                  >
                    {t === 'problems' ? (
                      <>
                        <span>Problems</span>
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#007acc] text-[9px] font-bold text-white">
                          0
                        </span>
                      </>
                    ) : (
                      <span>{t.charAt(0).toUpperCase() + t.slice(1).replace(/([A-Z])/g, ' $1')}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex shrink-0 items-center gap-1 text-[#858585] whitespace-nowrap">
                <div className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono text-[#cccccc] hover:bg-[#2a2d2e] cursor-pointer shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  <span>zsh</span>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                <button
                  type="button"
                  title="Clear Terminal"
                  onClick={() => window.dispatchEvent(new CustomEvent('orion:terminal-clear'))}
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>

                <button
                  type="button"
                  title={bottomPanelHeight > 280 ? 'Restore' : 'Maximize'}
                  onClick={() => setBottomPanelHeight((p) => (p > 280 ? 190 : 380))}
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {bottomPanelHeight > 280 ? (
                      <polyline points="6 9 12 15 18 9" />
                    ) : (
                      <polyline points="18 15 12 9 6 15" />
                    )}
                  </svg>
                </button>

                <button
                  type="button"
                  title="Close Panel"
                  onClick={() => setIsBottomPanelOpen(false)}
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Panel Content */}
            <div className="min-h-0 flex-1 overflow-hidden bg-[#181818]">
              {bottomPanelTab === 'terminal' && (
                <div className="h-full overflow-hidden">
                  <InteractiveTerminal sessionId={sessionId} sandboxPort={sandboxPort} repo={repo} />
                </div>
              )}
              {bottomPanelTab === 'problems' && (
                <div className="flex h-full items-center justify-center text-[#858585] text-[12px]">
                  No problems detected.
                </div>
              )}
              {bottomPanelTab === 'output' && (
                <div className="p-3 font-mono text-[11px] text-[#858585]">
                  [Orion] Sandbox connected (session: {sessionId}). Ready.
                </div>
              )}
              {bottomPanelTab === 'debug' && (
                <div className="flex h-full items-center justify-center text-[#858585] text-[12px]">
                  Debug console ready.
                </div>
              )}
              {bottomPanelTab === 'ports' && (
                <div className="p-3 font-mono text-[11px] text-[#cccccc]">
                  <div className="text-[#858585]">Forwarded Ports:</div>
                  <div className="mt-1 text-green">● Port 5001: Sandbox Runner (Active)</div>
                  {sandboxPort && <div className="mt-1 text-green">● Port {sandboxPort}: Application Preview</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 3E. Status Bar (22px, VS Code blue, guaranteed no wrapping) ── */}
        <div className="flex h-[22px] shrink-0 items-center justify-between overflow-hidden bg-[#007acc] px-2 font-mono text-[10.5px] text-white whitespace-nowrap">
          {/* Left section */}
          <div className="flex min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap">
            <button
              type="button"
              onClick={() => setActiveActivity((p) => (p === 'git' ? null : 'git'))}
              className="flex items-center gap-1 hover:bg-white/15 px-1 rounded transition-colors whitespace-nowrap shrink truncate max-w-[120px]"
            >
              <span className="shrink-0">⎇</span>
              <span className="truncate">{displayRepoName}</span>
            </button>
            <span className="whitespace-nowrap shrink-0">✓ 0 errors</span>
            <button
              type="button"
              onClick={() => setIsBottomPanelOpen((p) => !p)}
              className="flex items-center gap-1 hover:bg-white/15 px-1 rounded transition-colors whitespace-nowrap shrink-0"
            >
              ▲ Terminal
            </button>
          </div>

          {/* Right section */}
          <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <span className="whitespace-nowrap shrink-0">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span className="whitespace-nowrap shrink-0 hidden sm:inline">Spaces: 2</span>
            <span className="whitespace-nowrap shrink-0 hidden md:inline">UTF-8</span>
            <span className="whitespace-nowrap shrink-0 font-semibold uppercase">{activeTab.lang}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
