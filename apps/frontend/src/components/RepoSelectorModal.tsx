import { useEffect, useState } from 'react';
import { showToast } from './Toast';

export interface GitHubRepoItem {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch?: string;
}

export interface GitHubStatusData {
  connected: boolean;
  installationId?: string;
  installUrl?: string;
  repositories: GitHubRepoItem[];
  error?: string;
}

interface RepoSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSessionId: string;
  currentRepo?: string;
  onRepoSelected: (repoFullName: string) => void;
}

export default function RepoSelectorModal({
  isOpen,
  onClose,
  activeSessionId,
  currentRepo,
  onRepoSelected,
}: RepoSelectorModalProps) {
  const [status, setStatus] = useState<GitHubStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cloningRepo, setCloningRepo] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  // Fetch GitHub App status and accessible repos
  const fetchStatus = () => {
    setLoading(true);
    fetch('/api/github/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok) {
          setStatus({
            connected: data.connected ?? false,
            installationId: data.installationId,
            installUrl: data.installUrl || 'https://github.com/apps/orion-coding-agent/installations/new',
            repositories: Array.isArray(data.repositories) ? data.repositories : [],
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load GitHub status', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Clone an existing GitHub repo using backend token cloning
  const handleClone = async (repoFullName: string) => {
    setCloningRepo(repoFullName);
    try {
      const res = await fetch(`/sessions/${activeSessionId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Clone failed');
      }

      showToast(`Cloned ${repoFullName} successfully!`, 'success');
      onRepoSelected(repoFullName);
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to clone repository', 'warning');
    } finally {
      setCloningRepo(null);
    }
  };

  // Initialize a fresh clean workspace
  const handleInitClean = async () => {
    setCloningRepo('clean-init');
    try {
      const res = await fetch(`/sessions/${activeSessionId}/init-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to initialize empty repository');

      showToast('Initialized fresh workspace with git', 'success');
      onRepoSelected('workspace');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to initialize workspace', 'warning');
    } finally {
      setCloningRepo(null);
    }
  };

  const filteredRepos = status?.repositories.filter(
    (r) =>
      r.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      r.fullName.toLowerCase().includes(filterQuery.toLowerCase()),
  ) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div
        className="flex max-h-[85vh] w-full max-w-[560px] flex-col rounded-window border border-line bg-canvas shadow-modal animate-scale-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-control bg-surface border border-line text-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="6" r="3" />
                <path d="M6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M12 12v3" />
              </svg>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-ink">Select or Clone Repository</h3>
              <p className="text-[12px] text-ink-3">Choose a GitHub repository for Orion to work on in the sandbox</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* GitHub Connection Banner */}
          {loading ? (
            <div className="flex items-center justify-center p-4 text-[12px] text-ink-3">
              Checking GitHub App connection…
            </div>
          ) : status?.connected ? (
            <div className="flex items-center justify-between rounded-control border border-green/30 bg-green-tint/40 p-3 text-[12.5px]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
                <span className="font-medium text-green">GitHub App Connected</span>
                {status.installationId && (
                  <span className="font-mono text-[11px] text-ink-3">#{status.installationId}</span>
                )}
              </div>
              <a
                href={status.installUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-accent hover:underline flex items-center gap-1"
              >
                Add more repos
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-control border border-orange/40 bg-orange/10 p-3.5 text-[12.5px]">
              <div className="flex items-center gap-2 font-medium text-orange">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>GitHub App Not Installed on Your Repos</span>
              </div>
              <p className="text-[12px] text-ink-2">
                Install Orion on your GitHub account so it can clone repositories, run tests, and open verified Pull Requests.
              </p>
              <a
                href={status?.installUrl || 'https://github.com/apps/orion-coding-agent/installations/new'}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-control bg-accent px-3 py-1.5 text-[12px] font-medium text-canvas hover:opacity-90 shadow-btn transition-all"
              >
                <span>Install Orion GitHub App</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              </a>
            </div>
          )}

          {/* Section: Accessible GitHub Repositories */}
          {status?.repositories && status.repositories.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">
                  Your GitHub Repositories ({status.repositories.length})
                </span>
                {status.repositories.length > 3 && (
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Search repos…"
                    className="h-6 w-36 rounded border border-line bg-surface px-2 text-[11px] text-ink outline-none placeholder:text-ink-3"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                {filteredRepos.map((repo) => {
                  const isCurrent = currentRepo === repo.fullName || currentRepo === repo.name;
                  const isCloningThis = cloningRepo === repo.fullName;

                  return (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between rounded-control border border-line bg-surface p-2.5 hover:border-line-strong hover:bg-hover transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 shrink-0">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[12.5px] font-medium text-ink">{repo.fullName}</span>
                            <span
                              className={`rounded px-1.5 py-0.2 font-mono text-[10px] ${
                                repo.private ? 'bg-orange/15 text-orange' : 'bg-field text-ink-3'
                              }`}
                            >
                              {repo.private ? 'Private' : 'Public'}
                            </span>
                          </div>
                          {repo.defaultBranch && (
                            <span className="font-mono text-[10.5px] text-ink-3">branch: {repo.defaultBranch}</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={!!cloningRepo}
                        onClick={() => handleClone(repo.fullName)}
                        className={`shrink-0 rounded-control px-3 py-1 text-[11.5px] font-medium transition-all ${
                          isCurrent
                            ? 'bg-field text-ink-3 cursor-default'
                            : 'bg-accent text-canvas hover:opacity-90 shadow-btn active:scale-95'
                        }`}
                      >
                        {isCloningThis ? (
                          <span className="flex items-center gap-1.5">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-canvas border-t-transparent" />
                            <span>Cloning…</span>
                          </span>
                        ) : isCurrent ? (
                          'Active'
                        ) : (
                          'Clone & Open'
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Clone custom URL */}
          <div className="space-y-2 border-t border-line pt-4">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">
              Clone Any Git URL
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://github.com/owner/repository.git"
                className="h-8 flex-1 rounded-control border border-line bg-surface px-3 font-mono text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
              />
              <button
                type="button"
                disabled={!customUrl.trim() || !!cloningRepo}
                onClick={() => handleClone(customUrl.trim())}
                className="h-8 rounded-control bg-surface border border-line px-3 text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-40 transition-colors shadow-btn"
              >
                {cloningRepo === customUrl.trim() ? 'Cloning…' : 'Clone URL'}
              </button>
            </div>
          </div>

          {/* Section: Clean workspace */}
          <div className="space-y-2 border-t border-line pt-4">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">
              Or Start Clean
            </span>
            <button
              type="button"
              disabled={!!cloningRepo}
              onClick={handleInitClean}
              className="flex w-full items-center justify-between rounded-control border border-line bg-surface p-2.5 text-left hover:border-line-strong hover:bg-hover transition-colors"
            >
              <div>
                <span className="text-[12.5px] font-medium text-ink">Initialize Empty Git Repository</span>
                <p className="text-[11px] text-ink-3">Creates an empty workspace with git ready for custom code generation</p>
              </div>
              <span className="rounded bg-field px-2 py-1 font-mono text-[11px] text-ink-2">git init</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
