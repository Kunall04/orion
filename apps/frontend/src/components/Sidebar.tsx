import { useState } from 'react';
import OrionLogo from './OrionLogo';

export interface SessionItem {
  id: string;
  title: string;
  pr?: string;
  status: 'running' | 'done' | 'idle';
  time: string;
}

const NAV_ITEMS = [
  { icon: 'plus', label: 'New session', action: 'new_session' },
  { icon: 'zap', label: 'Automations' },
  { icon: 'shield', label: 'Security' },
  { icon: 'eye', label: 'Review' },
  { icon: 'book', label: 'Wiki' },
  { icon: 'sliders', label: 'Customize' },
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
  sliders: (
    <g>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </g>
  ),
};

export default function Sidebar({
  sessions = [],
  activeSession = 's1',
  onSelectSession,
  onNewSession,
}: {
  sessions?: SessionItem[];
  activeSession?: string;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void;
}) {
  const [activeNav, setActiveNav] = useState<string>('plus');

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-line bg-canvas">
      {/* Logo row */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-4">
        <OrionLogo size={19} />
        <span className="text-[13.5px] font-semibold tracking-tight text-ink">Orion</span>
        <span className="ml-auto rounded bg-field px-1.5 py-0.5 font-mono text-[10px] text-ink-3 shadow-hairline">
          beta
        </span>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-2 pt-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.icon}
            type="button"
            onClick={() => {
              setActiveNav(item.icon);
              if ('action' in item && item.action === 'new_session') {
                onNewSession?.();
              }
            }}
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

      {/* Divider + Session list */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-line px-2 pt-2">
        <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          Recent
        </p>
        <div className="flex flex-col gap-0.5">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSession?.(s.id)}
              className={`group flex w-full flex-col gap-0.5 rounded-control px-2.5 py-2 text-left transition-colors duration-100 ${
                activeSession === s.id
                  ? 'bg-surface shadow-btn'
                  : 'hover:bg-hover'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <span
                  className={`min-w-0 truncate text-[12.5px] font-medium ${
                    activeSession === s.id ? 'text-ink' : 'text-ink-2 group-hover:text-ink'
                  }`}
                >
                  {s.title}
                </span>
                {s.status === 'running' && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green animate-pulse" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {s.pr && <span className="font-mono text-[10.5px] text-accent">{s.pr}</span>}
                <span className="text-[10.5px] text-ink-3">{s.time}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom user pill */}
      <div className="mt-auto border-t border-line p-3">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors duration-100 hover:bg-hover"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
            K
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-ink">Kunall04</p>
            <p className="truncate font-mono text-[10px] text-ink-3">orion-coding-agent[bot]</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
            <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
