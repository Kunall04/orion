import { useRef, useState } from 'react';
import { showToast } from './Toast';

export default function PromptBar({
  onSend,
  onStop,
  disabled,
  repo = 'workspace',
  branch = 'main',
  onSelectRepo,
}: {
  onSend?: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  repo?: string;
  branch?: string;
  onSelectRepo?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = draft.trim().length > 0 && !disabled;

  const send = () => {
    if (!canSend) return;
    onSend?.(draft.trim());
    setDraft('');
  };

  const handleCopyRepo = () => {
    navigator.clipboard.writeText(repo);
    showToast(`Copied ${repo} to clipboard`, 'success');
  };

  const handleCopyBranch = () => {
    navigator.clipboard.writeText(branch);
    showToast(`Tracking branch ${branch}`, 'info');
  };

  return (
    <div
      className="flex flex-col rounded-window border border-line bg-surface shadow-raised transition-[border-color,box-shadow] duration-150 focus-within:border-line-strong"
      onClick={() => ref.current?.focus()}
      role="presentation"
    >
      {/* Text area */}
      <textarea
        ref={ref}
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={disabled ? "Orion is working on this task..." : "Ask Orion to build features, fix bugs, or work on your code"}
        disabled={disabled}
        className="min-h-[44px] w-full resize-none bg-transparent px-3.5 pt-3 text-[13.5px] leading-snug text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
      />

      {/* Footer row */}
      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
        {/* Repo / branch pill */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSelectRepo ?? handleCopyRepo}
            title="Click to select or clone a repository"
            className="flex h-6 items-center gap-1.5 rounded-chip border border-line bg-field px-2 text-[11.5px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:border-line-strong active:scale-95 cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" />
              <path d="M6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M12 12v3" />
            </svg>
            <span className="max-w-[140px] truncate font-mono">{repo}</span>
          </button>
          <button
            type="button"
            onClick={handleCopyBranch}
            title="Branch: click to copy"
            className="flex h-6 items-center gap-1 rounded-chip border border-line bg-field px-2 text-[11.5px] font-mono text-ink-2 transition-colors duration-100 hover:bg-hover active:scale-95"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 3v12M18 9l-6 6-6-6" />
            </svg>
            {branch}
          </button>
        </div>

        {/* Action button: Send or Stop */}
        {disabled ? (
          <button
            type="button"
            onClick={onStop}
            title="Stop generating"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-red/10 text-red hover:bg-red/20 transition-all duration-150 active:scale-95 shadow-btn border border-red/20"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            title="Send prompt (Enter)"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control transition-all duration-150 enabled:active:scale-95"
            style={{
              background: canSend ? 'var(--ink)' : 'var(--line-strong)',
              color: canSend ? 'var(--surface)' : 'var(--ink-3)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
