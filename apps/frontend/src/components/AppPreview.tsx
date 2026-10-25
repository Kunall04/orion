import { useState, useRef, useEffect } from 'react';

export interface AppPreviewProps {
  sessionId?: string;
  sandboxPort?: number;
  repo?: string;
  onRunCommand?: (command: string) => void;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

export default function AppPreview({
  sessionId = 's1',
  sandboxPort,
  repo = 'Kunall04/agent-checkout-gate',
  onRunCommand,
}: AppPreviewProps) {
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [selectedPort, setSelectedPort] = useState<number>(3000);
  const [url, setUrl] = useState<string>(`http://localhost:3000/`);
  const [inputUrl, setInputUrl] = useState<string>(`http://localhost:3000/`);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [mode, setMode] = useState<'live' | 'sample'>('sample');
  const [iframeLoaded, setIframeLoaded] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // When selected port changes, update target url
  useEffect(() => {
    const target = `http://localhost:${selectedPort}/`;
    setUrl(target);
    setInputUrl(target);
    setIframeKey((k) => k + 1);
  }, [selectedPort]);

  const handleReload = () => {
    setIsReloading(true);
    setIframeLoaded(false);
    setIframeKey((k) => k + 1);
    setTimeout(() => {
      setIsReloading(false);
    }, 600);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let target = inputUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `http://${target}`;
    }
    setUrl(target);
    setInputUrl(target);
    setIframeKey((k) => k + 1);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleOpenExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-ink select-none overflow-hidden">
      {/* ─── Top Browser Chrome Bar ─── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface px-3 gap-2">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Back"
            className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-40 transition-colors"
            disabled
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            title="Forward"
            className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-40 transition-colors"
            disabled
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            type="button"
            title="Reload preview"
            onClick={handleReload}
            className={`flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink transition-colors ${
              isReloading ? 'animate-spin text-accent' : ''
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
        </div>

        {/* URL Address Bar */}
        <form onSubmit={handleUrlSubmit} className="flex min-w-0 flex-1 items-center">
          <div className="flex h-7 w-full items-center gap-1.5 rounded-control border border-line bg-field px-2.5 transition-colors focus-within:border-accent">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="http://localhost:3000/"
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-ink outline-none placeholder:text-ink-3"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              title={copied ? 'Copied URL!' : 'Copy preview URL'}
              className="flex h-5 items-center gap-1 rounded px-1 text-[10px] text-ink-3 hover:text-ink hover:bg-hover transition-colors"
            >
              {copied ? (
                <span className="text-green font-medium">Copied!</span>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {/* Viewport switchers & External link */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Port presets */}
          <div className="hidden sm:flex items-center rounded-control bg-field p-0.5 border border-line">
            {[3000, 5173, 8080].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPort(p)}
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  selectedPort === p ? 'bg-surface text-ink font-semibold shadow-hairline' : 'text-ink-3 hover:text-ink'
                }`}
              >
                :{p}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-line mx-0.5" />

          {/* Desktop / Tablet / Mobile Viewport Buttons */}
          <div className="flex items-center rounded-control bg-field p-0.5 border border-line">
            <button
              type="button"
              title="Desktop viewport (100%)"
              onClick={() => setViewport('desktop')}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                viewport === 'desktop' ? 'bg-surface text-ink shadow-hairline' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </button>
            <button
              type="button"
              title="Tablet viewport (768px)"
              onClick={() => setViewport('tablet')}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                viewport === 'tablet' ? 'bg-surface text-ink shadow-hairline' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              title="Mobile viewport (375px)"
              onClick={() => setViewport('mobile')}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                viewport === 'mobile' ? 'bg-surface text-ink shadow-hairline' : 'text-ink-3 hover:text-ink'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </button>
          </div>

          {/* Open in new window */}
          <button
            type="button"
            title="Open in new window"
            onClick={handleOpenExternal}
            className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink transition-colors ml-0.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Mode Selector Sub-bar: Live Iframe vs Interactive Demo Preview ─── */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-surface/60 px-3 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="flex h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
          <span className="font-mono text-ink-3 text-[10px]">
            Target: <span className="text-ink font-semibold">{url}</span>
          </span>
          {sandboxPort && (
            <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9.5px] text-accent">
              Sandbox Container :{sandboxPort}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('live')}
            className={`rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
              mode === 'live' ? 'bg-surface text-ink font-semibold shadow-hairline border border-line' : 'text-ink-3 hover:text-ink'
            }`}
          >
            Live Server
          </button>
          <button
            type="button"
            onClick={() => setMode('sample')}
            className={`rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
              mode === 'sample' ? 'bg-surface text-ink font-semibold shadow-hairline border border-line' : 'text-ink-3 hover:text-ink'
            }`}
          >
            Interactive Mock
          </button>
        </div>
      </div>

      {/* ─── Viewport Area ─── */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-canvas p-3">
        <div
          className={`relative h-full transition-all duration-300 flex flex-col overflow-hidden ${
            viewport === 'desktop'
              ? 'w-full'
              : viewport === 'tablet'
              ? 'w-[768px] max-w-full rounded-xl border border-line bg-surface shadow-2xl'
              : 'w-[375px] max-w-full rounded-2xl border-4 border-line bg-surface shadow-2xl'
          }`}
        >
          {mode === 'live' ? (
            /* Live Iframe View */
            <div className="relative h-full w-full bg-white">
              {isReloading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 backdrop-blur-xs">
                  <div className="flex items-center gap-2 rounded-control bg-canvas px-3 py-1.5 text-xs font-medium text-ink shadow-card border border-line">
                    <svg className="h-3.5 w-3.5 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Reloading sandbox preview...
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={url}
                title="Orion Sandbox Application Preview"
                onLoad={() => setIframeLoaded(true)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                className="h-full w-full border-none"
              />
              {!iframeLoaded && !isReloading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-canvas">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <h4 className="text-[14px] font-semibold text-ink">Connecting to Sandbox Dev Server...</h4>
                  <p className="mt-1 max-w-[340px] text-[12px] text-ink-3">
                    If no application is serving on port <span className="font-mono text-accent">{selectedPort}</span> yet, ask Orion in chat or switch to <strong className="text-ink">Interactive Mock</strong>.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRunCommand?.('npm run dev')}
                      className="rounded-control bg-accent px-3 py-1 text-[11.5px] font-medium text-white hover:bg-accent-hover transition-colors shadow-btn"
                    >
                      Run `npm run dev`
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('sample')}
                      className="rounded-control border border-line bg-surface px-3 py-1 text-[11.5px] font-medium text-ink hover:bg-hover transition-colors"
                    >
                      View App Mock
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Interactive Sample / Mock View */
            <div className="h-full w-full overflow-y-auto bg-surface p-5 text-ink flex flex-col">
              {/* Header preview banner */}
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green/20 text-green font-bold text-sm">
                    ⚡
                  </div>
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-ink leading-tight">Checkout Gate Service</h3>
                    <p className="font-mono text-[10.5px] text-ink-3">{repo}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-green-tint px-2.5 py-0.5 text-[10px] font-semibold text-green">
                  <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
                  Service Health: 100% OK
                </span>
              </div>

              {/* Mock dashboard content */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-control border border-line bg-field p-3">
                  <span className="text-[11px] text-ink-3 font-medium">Rate Limit Window</span>
                  <p className="mt-1 font-mono text-[16px] font-semibold text-accent">10 req / 60s</p>
                  <span className="text-[10px] text-green flex items-center gap-1 mt-1 font-mono">
                    ✓ 429 Test Patched
                  </span>
                </div>
                <div className="rounded-control border border-line bg-field p-3">
                  <span className="text-[11px] text-ink-3 font-medium">Commit Attribution</span>
                  <p className="mt-1 font-mono text-[14px] font-semibold text-ink">orion-bot</p>
                  <span className="text-[10px] text-green flex items-center gap-1 mt-1 font-mono">
                    ✓ GitHub App Signed
                  </span>
                </div>
              </div>

              {/* Endpoint verification list */}
              <div className="mt-4 rounded-control border border-line bg-field p-3">
                <div className="flex items-center justify-between border-b border-line pb-2 mb-2">
                  <span className="text-[11.5px] font-semibold text-ink">Verified Sandbox Endpoints</span>
                  <span className="font-mono text-[10px] text-ink-3">HTTP / JSON</span>
                </div>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between py-1 border-b border-line/40">
                    <span className="text-accent">POST /api/checkout</span>
                    <span className="rounded bg-green/20 px-1.5 py-0.2 text-[9.5px] text-green font-bold">200 OK</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-line/40">
                    <span className="text-accent">POST /api/checkout (exceeded)</span>
                    <span className="rounded bg-orange-500/20 px-1.5 py-0.2 text-[9.5px] text-orange-400 font-bold">429 Rate Limited</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-accent">GET /health</span>
                    <span className="rounded bg-green/20 px-1.5 py-0.2 text-[9.5px] text-green font-bold">200 OK</span>
                  </div>
                </div>
              </div>

              {/* Interactive prompt to switch to live */}
              <div className="mt-auto pt-4 flex items-center justify-between border-t border-line text-[11px] text-ink-3">
                <span>Want to see custom frontend changes live?</span>
                <button
                  type="button"
                  onClick={() => setMode('live')}
                  className="rounded-control bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/25 transition-colors"
                >
                  Switch to Live Iframe →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
