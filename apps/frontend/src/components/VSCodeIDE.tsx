import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import InteractiveTerminal from './InteractiveTerminal';
import {
  buildFileTree,
  getDefaultExpandedDirs,
  getFileMeta,
  type FileTreeNode,
} from '../utils/fileTree';

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
  onOpenTerminalTab,
  repo,
}: VSCodeIDEProps) {
  // All workspace files (for the Explorer tree)
  const [workspaceFiles, setWorkspaceFiles] = useState<TabFile[]>(files);

  // Tabs currently open in the editor (VS Code Tab bar)
  const [openTabs, setOpenTabs] = useState<TabFile[]>(() => {
    const welcome = files.find((f) => f.isWelcome) || DEFAULT_FILES[0]!;
    const firstCodeFile = files.find((f) => !f.isWelcome);
    return firstCodeFile ? [firstCodeFile] : [welcome];
  });
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // Tree directory expansion state
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [hasInitializedExpandedDirs, setHasInitializedExpandedDirs] = useState(false);

  // Activity Bar & Sidebar state
  const [activeActivity, setActiveActivity] = useState<ActivityTab | null>('explorer');
  const [openEditorsExpanded, setOpenEditorsExpanded] = useState(true);
  const [projectRootExpanded, setProjectRootExpanded] = useState(true);

  // Search filter inside search panel
  const [searchFilter, setSearchFilter] = useState('');

  // Inline new file creation
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Integrated Bottom Panel state (Terminal / Problems / Output)
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

  // Sync workspaceFiles when prop changes
  useEffect(() => {
    if (files && files.length > 0) {
      setWorkspaceFiles(files);

      const tree = buildFileTree(files);
      if (!hasInitializedExpandedDirs && tree.length > 0) {
        const defaultExpanded = getDefaultExpandedDirs(tree, 2);
        setExpandedDirs(defaultExpanded);
        setHasInitializedExpandedDirs(true);
      }

      // If openTabs only had welcome and files arrived, open first meaningful file
      setOpenTabs((prev) => {
        if (prev.length === 1 && prev[0]?.isWelcome) {
          const mainFile =
            files.find((f) => f.path.includes('App') || f.path.includes('index') || f.path.includes('main')) ||
            files.find((f) => !f.isWelcome);
          if (mainFile) {
            return [mainFile];
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
            setOpenTabs((prev) =>
              prev.map((f, i) => (i === activeTabIdx ? { ...f, content: data.content } : f))
            );
            setWorkspaceFiles((prev) =>
              prev.map((f) => (f.path === activeTab.path ? { ...f, content: data.content } : f))
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

  // Open a file from the Explorer Tree or Search
  const handleOpenFile = (targetFile: TabFile) => {
    const existingIdx = openTabs.findIndex((t) => t.path === targetFile.path);
    if (existingIdx !== -1) {
      setActiveTabIdx(existingIdx);
    } else {
      // If only welcome tab is open, replace it
      if (openTabs.length === 1 && openTabs[0]?.isWelcome) {
        setOpenTabs([targetFile]);
        setActiveTabIdx(0);
      } else {
        const nextTabs = [...openTabs, targetFile];
        setOpenTabs(nextTabs);
        setActiveTabIdx(nextTabs.length - 1);
      }
    }
    setTimeout(() => {
      monacoEditorRef.current?.layout();
    }, 50);
  };

  const handleCloseTab = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (openTabs.length <= 1) {
      // Revert to welcome
      setOpenTabs([DEFAULT_FILES[0]!]);
      setActiveTabIdx(0);
      return;
    }
    const nextTabs = openTabs.filter((_, i) => i !== idx);
    setOpenTabs(nextTabs);
    if (activeTabIdx >= nextTabs.length) {
      setActiveTabIdx(Math.max(0, nextTabs.length - 1));
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const val = value ?? '';
    setOpenTabs((prev) =>
      prev.map((f, i) => (i === activeTabIdx ? { ...f, content: val, modified: true } : f))
    );
  };

  const handleSaveFile = async () => {
    if (!activeTab || activeTab.isWelcome || !sessionId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/sessions/${sessionId}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeTab.path,
          content: activeTab.content,
        }),
      });
      if (res.ok) {
        setOpenTabs((prev) =>
          prev.map((f, i) => (i === activeTabIdx ? { ...f, modified: false } : f))
        );
      }
    } catch {} finally {
      setIsSaving(false);
    }
  };

  // Create new file directly in workspace
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

  // Keyboard shortcut listener for Save (⌘S / Ctrl+S)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        setIsBottomPanelOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, sessionId]);

  // Toggle directory expansion
  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  // Collapse all directories
  const handleCollapseAllDirs = () => {
    setExpandedDirs(new Set());
  };

  // Refresh workspace files
  const handleRefreshFiles = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/sessions/${sessionId}/files`);
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.files)) {
          const freshFiles: TabFile[] = data.files.map((p: string) => {
            const meta = getFileMeta(p);
            return {
              name: p.split('/').pop() || p,
              path: p,
              lang: meta.lang,
              content: '',
            };
          });
          setWorkspaceFiles(freshFiles);
        }
      }
    } catch {}
  };

  // Resizing Bottom Panel
  const startPanelResize = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizingPanel(true);
    panelDragStartY.current = e.clientY;
    panelStartHeight.current = bottomPanelHeight;

    const onPointerMove = (ev: PointerEvent) => {
      const delta = panelDragStartY.current - ev.clientY;
      const nextH = Math.max(90, Math.min(panelStartHeight.current + delta, 480));
      setBottomPanelHeight(nextH);
      monacoEditorRef.current?.layout();
    };

    const onPointerUp = () => {
      setIsResizingPanel(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setTimeout(() => {
        monacoEditorRef.current?.layout();
      }, 50);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Build hierarchical file tree
  const fileTree = buildFileTree(workspaceFiles);
  const displayRepoName = repo ? repo.split('/').pop() || repo : 'workspace';

  // Recursive tree renderer matching VS Code skeleton
  const renderTreeNodes = (nodes: FileTreeNode[], depth = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedDirs.has(node.path);
      const isSelected = !node.isDir && activeTab.path === node.path;
      const paddingLeft = depth * 14 + 10;

      if (node.isDir) {
        return (
          <div key={node.id} className="flex flex-col select-none">
            <button
              type="button"
              onClick={() => toggleDir(node.path)}
              className="group relative flex h-[22px] w-full items-center gap-1.5 text-left text-[12px] text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
              style={{ paddingLeft: `${paddingLeft}px` }}
            >
              {/* Indent Guide Lines for depth > 0 */}
              {depth > 0 &&
                Array.from({ length: depth }).map((_, i) => (
                  <span
                    key={i}
                    className="absolute top-0 bottom-0 w-[1px] bg-[#333333] group-hover:bg-[#444444]"
                    style={{ left: `${i * 14 + 14}px` }}
                  />
                ))}

              {/* Chevron Arrow */}
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

              {/* Folder Icon */}
              <span className="text-[#dcb67a]">
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

              {/* Folder Name */}
              <span className="truncate font-sans font-medium text-[12px]">{node.name}</span>
            </button>

            {/* Render children if directory is expanded */}
            {isExpanded && node.children.length > 0 && renderTreeNodes(node.children, depth + 1)}
          </div>
        );
      }

      // File Node
      const meta = getFileMeta(node.name);
      return (
        <div key={node.id} className="relative flex select-none">
          {/* Indent Guide Lines for depth > 0 */}
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
            className={`group flex h-[22px] w-full items-center gap-1.5 text-left text-[12px] transition-colors ${
              isSelected
                ? 'bg-[#37373d] text-white font-medium'
                : 'text-[#969696] hover:bg-[#2a2d2e] hover:text-[#cccccc]'
            }`}
            style={{ paddingLeft: `${paddingLeft + 16}px` }}
          >
            {/* File Icon Badge */}
            <span
              className="flex h-3.5 w-4 shrink-0 items-center justify-center font-mono text-[9.5px] font-bold"
              style={{ color: meta.color }}
            >
              {meta.badge}
            </span>

            {/* File Name */}
            <span className="truncate font-sans text-[12px]">{node.name}</span>
          </button>
        </div>
      );
    });
  };

  // Breadcrumbs segments
  const breadcrumbSegments = activeTab.isWelcome
    ? ['welcome']
    : [displayRepoName, ...activeTab.path.split('/').filter(Boolean)];

  return (
    <div className="flex h-full w-full select-none overflow-hidden bg-[#1e1e1e] font-sans text-white">
      {/* ── 1. VS Code Left Activity Bar (48px) ── */}
      <aside className="flex w-[48px] shrink-0 flex-col items-center justify-between border-r border-[#252526] bg-[#333333] py-2 text-[#858585]">
        {/* Top Activity Icons */}
        <div className="flex flex-col items-center gap-2">
          {/* Explorer Icon */}
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

          {/* Search Icon */}
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

          {/* Source Control / Git Icon */}
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

        {/* Bottom Activity Icons */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            title="Settings"
            className="flex h-8 w-8 items-center justify-center rounded hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83 0 2 2 0 0 1 0 2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── 2. VS Code Primary Side Bar (Explorer / Search / Git) ── */}
      {activeActivity !== null && (
        <div className="flex w-[230px] shrink-0 flex-col border-r border-[#252526] bg-[#252526] text-[12px] font-sans">
          {/* ── 2A. Explorer View ── */}
          {activeActivity === 'explorer' && (
            <div className="flex h-full flex-col overflow-hidden">
              {/* Explorer Header */}
              <div className="flex h-[35px] shrink-0 items-center justify-between px-3 uppercase tracking-wider text-[#bbbbbb]">
                <span className="text-[11px] font-bold text-[#bbbbbb]">Explorer</span>
                <div className="flex items-center gap-1 text-[#858585]">
                  {/* New File Button */}
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

                  {/* Refresh Button */}
                  <button
                    type="button"
                    title="Refresh Explorer"
                    onClick={handleRefreshFiles}
                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#333333] hover:text-white transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>

                  {/* Collapse All Folders Button */}
                  <button
                    type="button"
                    title="Collapse Folders in Explorer"
                    onClick={handleCollapseAllDirs}
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

              {/* Scrollable Explorer Contents */}
              <div className="flex-1 overflow-y-auto no-scrollbar pb-4">
                {/* Accordion 1: OPEN EDITORS */}
                <div className="flex flex-col border-t border-[#1e1e1e]">
                  <button
                    type="button"
                    onClick={() => setOpenEditorsExpanded((prev) => !prev)}
                    className="flex h-[24px] items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb] hover:text-white transition-colors"
                  >
                    <span className="text-[#858585]">
                      {openEditorsExpanded ? '▾' : '▸'}
                    </span>
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
                            <div className="flex items-center gap-1">
                              {tab.modified && (
                                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                              )}
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

                {/* Accordion 2: PROJECT ROOT TREE */}
                <div className="flex flex-col border-t border-[#1e1e1e] mt-1">
                  <button
                    type="button"
                    onClick={() => setProjectRootExpanded((prev) => !prev)}
                    className="flex h-[24px] items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb] hover:text-white transition-colors"
                  >
                    <span className="text-[#858585]">
                      {projectRootExpanded ? '▾' : '▸'}
                    </span>
                    <span className="truncate">{displayRepoName}</span>
                  </button>

                  {projectRootExpanded && (
                    <div className="flex flex-col pt-0.5">
                      {/* Inline New File Creator */}
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
                              if (e.key === 'Escape') setIsCreatingFile(false);
                            }}
                            onBlur={handleCreateNewFile}
                            placeholder="file.ts or dir/file.ts"
                            className="w-full bg-[#3c3c3c] px-1.5 py-0.5 text-[11px] text-white outline-none rounded-none border border-accent"
                          />
                        </div>
                      )}

                      {/* Hierarchical Folder & File Tree */}
                      {fileTree.length > 0 ? (
                        renderTreeNodes(fileTree, 0)
                      ) : (
                        <div className="p-3 text-[#777777] text-[11px]">
                          No workspace files loaded.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── 2B. Search View ── */}
          {activeActivity === 'search' && (
            <div className="flex h-full flex-col p-3 gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb]">Search</span>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search files by name..."
                className="w-full rounded bg-[#3c3c3c] px-2.5 py-1 text-[11.5px] text-white outline-none border border-transparent focus:border-accent"
              />
              <div className="flex flex-col gap-0.5 mt-2 overflow-y-auto">
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
                        <span className="font-mono text-[9px] font-bold" style={{ color: meta.color }}>
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

          {/* ── 2C. Source Control (Git) View ── */}
          {activeActivity === 'git' && (
            <div className="flex h-full flex-col p-3 gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb]">Source Control</span>
                <span className="rounded bg-[#333333] px-1.5 py-0.2 font-mono text-[10px] text-white">
                  {openTabs.filter((t) => t.modified).length}
                </span>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto">
                <span className="text-[10.5px] font-semibold text-[#858585] uppercase">Changes</span>
                {openTabs.filter((t) => t.modified).map((t) => (
                  <div
                    key={t.path}
                    onClick={() => {
                      const idx = openTabs.findIndex((f) => f.path === t.path);
                      if (idx !== -1) setActiveTabIdx(idx);
                    }}
                    className="flex items-center justify-between rounded px-2 py-1 text-[12px] text-accent hover:bg-[#2a2d2e] cursor-pointer"
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="text-[10px] text-accent font-bold">M</span>
                  </div>
                ))}
                {!openTabs.some((t) => t.modified) && (
                  <div className="py-2 text-[11px] text-[#666666]">No uncommitted changes in open tabs.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. Main Editor Column (Tabs, Breadcrumbs, Monaco, Resizable Bottom Panel) ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── 3A. VS Code Tab Bar ── */}
        <div className="flex h-[35px] shrink-0 items-center justify-between bg-[#252526] border-b border-[#181818]">
          {/* Scrollable Tabs */}
          <div className="flex h-full items-center overflow-x-auto no-scrollbar">
            {openTabs.map((file, idx) => {
              const isActive = idx === activeTabIdx;
              const meta = getFileMeta(file.name);
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setActiveTabIdx(idx)}
                  className={`group flex h-full items-center gap-2 border-r border-[#181818] px-3 font-sans text-[12px] transition-colors ${
                    isActive
                      ? 'bg-[#1e1e1e] text-white border-t-2 border-t-accent'
                      : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#1e1e1e]/60 hover:text-[#cccccc]'
                  }`}
                >
                  <span className="font-mono text-[10px] font-bold" style={{ color: meta.color }}>
                    {meta.badge}
                  </span>
                  <span className="truncate max-w-[130px]">{file.name}</span>
                  {file.modified && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  <span
                    onClick={(e) => handleCloseTab(e, idx)}
                    className="ml-1 rounded p-0.5 text-[#858585] opacity-0 group-hover:opacity-100 hover:text-white"
                  >
                    ✕
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action buttons on tab bar (Save, Split, Toggle Terminal) */}
          <div className="flex items-center gap-1.5 px-2 text-[#858585]">
            {activeTab.modified && (
              <button
                type="button"
                onClick={handleSaveFile}
                disabled={isSaving}
                className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[10.5px] text-accent hover:bg-accent/30 transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save (⌘S)'}
              </button>
            )}

            {/* Toggle Terminal Bottom Panel */}
            <button
              type="button"
              title="Toggle Integrated Terminal (⌃`)"
              onClick={() => setIsBottomPanelOpen((prev) => !prev)}
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-[#333333] transition-colors ${
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
        <div className="flex h-[22px] shrink-0 items-center gap-1.5 border-b border-[#252526] bg-[#1e1e1e] px-4 font-sans text-[11px] text-[#888888] overflow-x-auto no-scrollbar">
          {breadcrumbSegments.map((segment, i) => {
            const isLast = i === breadcrumbSegments.length - 1;
            return (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[#555555]">&gt;</span>}
                <span className={isLast ? 'font-medium text-[#cccccc]' : 'hover:text-[#aaaaaa]'}>
                  {segment}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── 3C. Monaco Code Editor Workspace ── */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e]">
          {isLoadingFile ? (
            <div className="flex h-full items-center justify-center text-[#888888] font-mono text-xs gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Loading file from sandbox workspace...
            </div>
          ) : activeTab.isWelcome ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[#cccccc]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#252526] text-accent text-2xl shadow-card border border-[#333333] mb-4">
                ✨
              </div>
              <h2 className="text-lg font-semibold text-white">Orion Sandbox IDE</h2>
              <p className="mt-1 max-w-md text-xs text-[#888888] leading-relaxed">
                Explore files from the hierarchical Explorer on the left, edit code with full syntax highlighting, or run commands in the integrated Terminal panel below.
              </p>
              <div className="mt-5 flex items-center gap-3">
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
              value={activeTab.content}
              theme="vs-dark"
              onChange={handleEditorChange}
              onMount={(editor) => {
                monacoEditorRef.current = editor;
                editor.onDidChangeCursorPosition((e) => {
                  setCursorPos({ line: e.position.lineNumber, col: e.position.column });
                });
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
                padding: { top: 8, bottom: 8 },
              }}
            />
          )}
        </div>

        {/* ── 3D. Integrated Resizable Bottom Panel (Terminal / Problems / Output) ── */}
        {isBottomPanelOpen && (
          <div
            style={{ height: bottomPanelHeight }}
            className="relative flex flex-col shrink-0 border-t border-[#333333] bg-[#1e1e1e]"
          >
            {/* Draggable Resize Handle */}
            <div
              onPointerDown={startPanelResize}
              title="Drag to resize panel"
              className={`absolute -top-1 left-0 right-0 z-10 h-2 cursor-row-resize select-none ${
                isResizingPanel ? 'bg-accent/30' : 'hover:bg-accent/20'
              }`}
            />

            {/* Panel Tab Bar (Matching VS Code Image 4) */}
            <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-[#252526] bg-[#181818] px-3">
              {/* Left Panel Tabs */}
              <div className="flex h-full items-center gap-4 text-[11.5px] font-sans">
                <button
                  type="button"
                  onClick={() => setBottomPanelTab('problems')}
                  className={`flex h-full items-center gap-1.5 transition-colors ${
                    bottomPanelTab === 'problems'
                      ? 'border-b-2 border-white text-white font-medium'
                      : 'text-[#858585] hover:text-[#cccccc]'
                  }`}
                >
                  <span>Problems</span>
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#007acc] text-[9px] font-bold text-white">
                    0
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBottomPanelTab('output')}
                  className={`flex h-full items-center transition-colors ${
                    bottomPanelTab === 'output'
                      ? 'border-b-2 border-white text-white font-medium'
                      : 'text-[#858585] hover:text-[#cccccc]'
                  }`}
                >
                  Output
                </button>

                <button
                  type="button"
                  onClick={() => setBottomPanelTab('debug')}
                  className={`flex h-full items-center transition-colors ${
                    bottomPanelTab === 'debug'
                      ? 'border-b-2 border-white text-white font-medium'
                      : 'text-[#858585] hover:text-[#cccccc]'
                  }`}
                >
                  Debug Console
                </button>

                <button
                  type="button"
                  onClick={() => setBottomPanelTab('terminal')}
                  className={`flex h-full items-center gap-1.5 transition-colors ${
                    bottomPanelTab === 'terminal'
                      ? 'border-b-2 border-white text-white font-medium'
                      : 'text-[#858585] hover:text-[#cccccc]'
                  }`}
                >
                  <span>Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBottomPanelTab('ports')}
                  className={`flex h-full items-center transition-colors ${
                    bottomPanelTab === 'ports'
                      ? 'border-b-2 border-white text-white font-medium'
                      : 'text-[#858585] hover:text-[#cccccc]'
                  }`}
                >
                  Ports
                </button>
              </div>

              {/* Right Panel Controls (Image 4) */}
              <div className="flex items-center gap-1 text-[#858585]">
                {/* zsh pill dropdown */}
                <div className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-mono text-[#cccccc] hover:bg-[#2a2d2e] cursor-pointer">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  <span>zsh</span>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* + New terminal button */}
                <button
                  type="button"
                  title="New Terminal"
                  onClick={() => window.dispatchEvent(new CustomEvent('orion:terminal-command', { detail: { command: 'clear', output: '' } }))}
                  className="flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-[#2a2d2e] hover:text-white transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Split Terminal button */}
                <button
                  type="button"
                  title="Split Terminal"
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="12" y1="3" x2="12" y2="21" />
                  </svg>
                </button>

                {/* Trash Can button (Kill / Clear Terminal) */}
                <button
                  type="button"
                  title="Kill / Clear Terminal"
                  onClick={() => window.dispatchEvent(new CustomEvent('orion:terminal-clear'))}
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>

                {/* More actions ... */}
                <button
                  type="button"
                  title="More Actions..."
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="19" cy="12" r="1.5" />
                  </svg>
                </button>

                {/* Maximize / Restore Panel Height */}
                <button
                  type="button"
                  title={bottomPanelHeight > 280 ? 'Restore Panel Size' : 'Maximize Panel Size'}
                  onClick={() => setBottomPanelHeight((prev) => (prev > 280 ? 190 : 380))}
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {bottomPanelHeight > 280 ? (
                      <polyline points="6 9 12 15 18 9" />
                    ) : (
                      <polyline points="18 15 12 9 6 15" />
                    )}
                  </svg>
                </button>

                {/* Close Panel Button */}
                <button
                  type="button"
                  title="Close Panel"
                  onClick={() => setIsBottomPanelOpen(false)}
                  className="rounded p-1 hover:bg-[#2a2d2e] hover:text-white transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Panel Tab Content */}
            <div className="min-h-0 flex-1 overflow-hidden bg-[#181818]">
              {bottomPanelTab === 'terminal' && (
                <div className="h-full overflow-hidden">
                  <InteractiveTerminal sessionId={sessionId} sandboxPort={sandboxPort} repo={repo} />
                </div>
              )}
              {bottomPanelTab === 'problems' && (
                <div className="flex h-full items-center justify-center text-[#858585] text-[12px]">
                  No problems have been detected in the workspace.
                </div>
              )}
              {bottomPanelTab === 'output' && (
                <div className="p-3 font-mono text-[11px] text-[#858585]">
                  [Orion] Workspace sandbox connected (session: {sessionId}). Ready.
                </div>
              )}
              {bottomPanelTab === 'debug' && (
                <div className="flex h-full items-center justify-center text-[#858585] text-[12px]">
                  Debug console ready. Attach debugger to inspect.
                </div>
              )}
              {bottomPanelTab === 'ports' && (
                <div className="p-3 text-[12px] text-[#cccccc]">
                  <div className="font-mono text-[11px] text-[#858585]">Forwarded Ports:</div>
                  <div className="mt-1 font-mono text-[11px] text-green">
                    ● Port 5001: Sandbox Runner (Active)
                  </div>
                  {sandboxPort && (
                    <div className="mt-1 font-mono text-[11px] text-green">
                      ● Port {sandboxPort}: Application Preview
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 3E. VS Code Bottom Status Bar (Height: 22px, Blue #007acc) ── */}
        <div className="flex h-[22px] shrink-0 items-center justify-between bg-[#007acc] px-2 font-mono text-[11px] text-white">
          {/* Left Status Bar Items */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveActivity((prev) => (prev === 'git' ? null : 'git'))}
              className="flex items-center gap-1 hover:bg-white/15 px-1 rounded transition-colors"
            >
              <span>⎇</span>
              <span>{displayRepoName}</span>
            </button>
            <div className="flex items-center gap-1">
              <span>✓</span>
              <span>0 errors</span>
            </div>
            <button
              type="button"
              onClick={() => setIsBottomPanelOpen((prev) => !prev)}
              className="flex items-center gap-1 hover:bg-white/15 px-1 rounded transition-colors"
            >
              <span>▲ Terminal</span>
            </button>
          </div>

          {/* Right Status Bar Items (Cursor Ln/Col, Encoding, Lang) */}
          <div className="flex items-center gap-3">
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span>LF</span>
            <span className="font-semibold uppercase">{activeTab.lang}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
