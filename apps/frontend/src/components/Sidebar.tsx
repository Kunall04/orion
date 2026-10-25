import { useState } from 'react';
import OrionLogo from './OrionLogo';
import { showToast } from './Toast';

export interface SessionItem {
  id: string;
  title: string;
  pr?: string;
  prCount?: number;
  subtitle?: string;
  status: 'running' | 'done' | 'idle';
  statusColor?: 'orange' | 'green' | 'blue' | 'gray';
  time: string;
  sandboxPort?: number;
}

const NAV_ITEMS = [
  { icon: 'plus', label: 'New session', action: 'new_session' },
  { icon: 'zap', label: 'Automations', action: 'automations' },
  { icon: 'shield', label: 'Security', action: 'security' },
  { icon: 'eye', label: 'Review', action: 'review' },
  { icon: 'book', label: 'Wiki', action: 'wiki' },
] as const;

const ICON_PATHS: Record<string, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  zap: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  eye: (
    <g>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  ),
  book: (
    <g>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </g>
  ),
};

export default function Sidebar({
  sessions = [],
  activeSession = 's1',
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onCollapse,
}: {
  sessions?: SessionItem[];
  activeSession?: string;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void;
  onDeleteSession?: (id: string) => void;
  onCollapse?: () => void;
}) {
  const [activeNav, setActiveNav] = useState<string>('plus');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const handleNavClick = (item: (typeof NAV_ITEMS)[number]) => {
    setActiveNav(item.icon);
    if (item.action === 'new_session') {
      onNewSession?.();
    } else if (item.action === 'automations') {
      showToast('Automations: recurring agent tasks available soon', 'info');
    } else if (item.action === 'security') {
      showToast('Security: sandbox resource caps and process jail active', 'success');
    } else if (item.action === 'review') {
      showToast('Review: Pull request verification mode active', 'info');
    } else if (item.action === 'wiki') {
      showToast('Documentation: visit github.com/Kunall04/orion', 'info');
    }
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sessions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `orion-sessions-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Exported session history to JSON', 'success');
  };

  const filteredSessions = searchQuery.trim()
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.subtitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.pr?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : sessions;

  return (
    <aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-line bg-canvas select-none">
      {/* ── Header: User Avatar & Dropdown (Image 2) ── */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line px-3">
        <div
          onClick={() => showToast('Signed in as Harkirat (IITR)', 'info')}
          className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-85 transition-opacity"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface border border-line text-[11px] font-semibold text-ink">
            H
          </div>
          <span className="truncate text-[12px] font-medium text-ink">harkirat.iitr@gmail.com</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 shrink-0">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        <div className="flex items-center gap-1 text-ink-3">
          <button
            type="button"
            title="Search sessions"
            onClick={() => setShowSearch((prev) => !prev)}
            className={`rounded p-1 transition-colors ${showSearch ? 'bg-surface text-ink' : 'hover:bg-hover hover:text-ink'}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button
            type="button"
            title="Collapse sidebar"
            onClick={onCollapse}
            className="rounded p-1 hover:bg-hover hover:text-ink transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Input Bar (when toggled) */}
      {showSearch && (
        <div className="px-2 pt-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sessions..."
            autoFocus
            className="w-full rounded-control border border-line bg-surface px-2.5 py-1 text-[12px] text-ink outline-none placeholder:text-ink-3 shadow-hairline"
          />
        </div>
      )}

      {/* ── Primary Navigation ── */}
      <nav className="flex flex-col gap-0.5 px-2 pt-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.icon}
            type="button"
            onClick={() => handleNavClick(item)}
            className={`flex h-8 w-full items-center gap-2.5 rounded-control px-2.5 text-[12.5px] font-medium transition-colors duration-100 ${
              item.icon === 'plus'
                ? 'bg-field text-ink hover:bg-surface shadow-hairline'
                : activeNav === item.icon
                  ? 'bg-surface text-ink shadow-btn'
                  : 'text-ink-2 hover:bg-hover hover:text-ink'
            }`}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              {ICON_PATHS[item.icon]}
            </svg>
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Recent Section (Image 2) ── */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-line px-2 pt-2">
        <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-semibold text-ink-3">
          <span>Recent {filteredSessions.length !== sessions.length ? `(${filteredSessions.length})` : ''}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Toggle filter"
              onClick={() => setShowSearch((prev) => !prev)}
              className="p-0.5 hover:text-ink transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              type="button"
              title="Sort options"
              onClick={() => showToast('Sorted by most recent activity', 'info')}
              className="p-0.5 hover:text-ink transition-colors"
            >
              ···
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {filteredSessions.map((s) => {
            const isActive = activeSession === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSession?.(s.id)}
                className={`group flex w-full flex-col gap-0.5 rounded-control px-2.5 py-2 text-left transition-colors duration-100 ${
                  isActive ? 'bg-surface shadow-btn' : 'hover:bg-hover'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span
                    className={`min-w-0 truncate text-[12.5px] font-medium ${
                      isActive ? 'text-ink' : 'text-ink-2 group-hover:text-ink'
                    }`}
                  >
                    {s.title}
                  </span>
                  <div className="flex items-center gap-1">
                    {onDeleteSession && (
                      <span
                        role="button"
                        title="Delete session"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(s.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ink-3 hover:text-red hover:bg-hover transition-opacity"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </span>
                    )}
                    {s.statusColor && (
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          s.statusColor === 'orange'
                            ? 'bg-amber-500'
                            : s.statusColor === 'green'
                              ? 'bg-green'
                              : s.statusColor === 'blue'
                                ? 'bg-accent'
                                : 'bg-ink-3/40'
                        }`}
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-ink-3">
                  {s.subtitle && <span className="truncate">{s.subtitle}</span>}
                  {s.sandboxPort && (
                    <span className="font-mono text-[9.5px] text-accent/80">
                      :{s.sandboxPort}
                    </span>
                  )}
                  {s.pr && (
                    <span className="flex items-center gap-0.5 font-mono text-[10px] text-accent">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
                      </svg>
                      {s.prCount || 1}
                    </span>
                  )}
                  {!s.subtitle && !s.pr && <span>{s.time}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Controls (Image 2: Settings, Download, Help) ── */}
      <div className="mt-auto border-t border-line px-3 py-2 flex items-center justify-between text-ink-3">
        <button
          type="button"
          onClick={() => showToast('Orion Cloud Agent · Fastify API + Isolated Microcontainers', 'info')}
          className="flex items-center gap-2 rounded-control px-2 py-1 text-[12px] font-medium hover:bg-hover hover:text-ink transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Download sessions"
            onClick={handleExport}
            className="rounded p-1 hover:bg-hover hover:text-ink transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            type="button"
            title="Shortcuts & Help"
            onClick={() => showToast('Enter to send prompt · Esc to blur', 'info')}
            className="rounded p-1 hover:bg-hover hover:text-ink transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
