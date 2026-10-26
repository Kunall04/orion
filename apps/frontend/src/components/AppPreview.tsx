import { useState, useRef, useEffect } from 'react';

export interface AppPreviewProps {
  sessionId?: string;
  sandboxPort?: number;
  repo?: string;
  onRunCommand?: (command: string) => void;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type DevToolsTab = 'Elements' | 'Console' | 'Sources' | 'Network' | 'Application' | 'Chii';

interface NetworkRequestItem {
  id: string;
  status: number | 'FAIL';
  statusText: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  name: string;
  type: 'fetch' | 'xhr' | 'document' | 'stylesheet' | 'script' | 'image';
  time: string;
  size: string;
  payload?: string;
  response?: string;
}

interface ConsoleLogItem {
  id: string;
  type: 'log' | 'warn' | 'error' | 'info';
  msg: string;
  time: string;
  source?: string;
}

const DEFAULT_NETWORK_REQUESTS: NetworkRequestItem[] = [
  {
    id: 'req-1',
    status: 200,
    statusText: 'OK',
    method: 'POST',
    name: '/api/checkout',
    type: 'fetch',
    time: '34 ms',
    size: '1.2 KB',
    payload: '{"items": [{"id": "item_14", "qty": 1}], "coupon": "SUMMER20"}',
    response: '{"success": true, "orderId": "ord_882910", "total": 49.99}',
  },
  {
    id: 'req-2',
    status: 200,
    statusText: 'OK',
    method: 'GET',
    name: '/api/user/session',
    type: 'fetch',
    time: '18 ms',
    size: '640 B',
    response: '{"user": "dev_user", "authenticated": true, "scope": "write"}',
  },
  {
    id: 'req-3',
    status: 429,
    statusText: 'Too Many Requests',
    method: 'POST',
    name: '/api/checkout',
    type: 'fetch',
    time: '12 ms',
    size: '180 B',
    payload: '{"items": [{"id": "item_14", "qty": 1}]}',
    response: '{"error": "Rate limit exceeded: max 10 requests per minute"}',
  },
  {
    id: 'req-4',
    status: 200,
    statusText: 'OK',
    method: 'GET',
    name: '/health',
    type: 'fetch',
    time: '6 ms',
    size: '42 B',
    response: '{"status": "healthy", "uptime": 482}',
  },
];

const DEFAULT_CONSOLE_LOGS: ConsoleLogItem[] = [
  { id: 'log-1', type: 'info', msg: '[App] Initializing Checkout Gate client v2.4.1', time: '10:42:01', source: 'main.tsx:12' },
  { id: 'log-2', type: 'log', msg: '[Auth] Verified JWT signature via GitHub App gate', time: '10:42:02', source: 'auth.ts:45' },
  { id: 'log-3', type: 'warn', msg: '[RateLimit] Approaching limit threshold: 9/10 requests used', time: '10:42:04', source: 'gate.ts:89' },
  { id: 'log-4', type: 'error', msg: 'FetchError: POST /api/checkout failed with HTTP 429 (Rate Limit Exceeded)', time: '10:42:05', source: 'tasks.test.ts:34' },
];

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
  const [showDevTools, setShowDevTools] = useState<boolean>(false);
  const [devToolsTab, setDevToolsTab] = useState<DevToolsTab>('Elements');
  const [networkRequests, setNetworkRequests] = useState<NetworkRequestItem[]>(DEFAULT_NETWORK_REQUESTS);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogItem[]>(DEFAULT_CONSOLE_LOGS);
  const [consoleInput, setConsoleInput] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequestItem | null>(null);
  const [selectedElement, setSelectedElement] = useState<string>('div#checkout-app');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // When selected port changes, update target url
  useEffect(() => {
    const target = `http://localhost:${selectedPort}/`;
    setUrl(target);
    setInputUrl(target);
    setIframeKey((k) => k + 1);
  }, [selectedPort]);

  // Listen for message events from injected spy script
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'ORION_NETWORK_EVENT') {
        const item: NetworkRequestItem = {
          id: `req-${Date.now()}-${Math.random()}`,
          status: e.data.request.status,
          statusText: e.data.request.status === 200 ? 'OK' : 'Error',
          method: e.data.request.method || 'GET',
          name: e.data.request.url,
          type: 'fetch',
          time: `${e.data.request.time} ms`,
          size: '640 B',
        };
        setNetworkRequests((prev) => [item, ...prev]);
      } else if (e.data?.type === 'ORION_CONSOLE_EVENT') {
        const item: ConsoleLogItem = {
          id: `log-${Date.now()}`,
          type: e.data.level || 'log',
          msg: e.data.args?.join(' ') || '',
          time: new Date().toLocaleTimeString(),
        };
        setConsoleLogs((prev) => [...prev, item]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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

    // Smart unblocking proxy for external domains (e.g. google.com, github.com)
    let effectiveUrl = target;
    try {
      const parsed = new URL(target);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        effectiveUrl = `http://localhost:4000/api/proxy/browse?url=${encodeURIComponent(target)}`;
      }
    } catch {}

    setUrl(effectiveUrl);
    setInputUrl(target);
    setIframeKey((k) => k + 1);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(inputUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleOpenExternal = () => {
    window.open(inputUrl, '_blank', 'noopener,noreferrer');
  };

  const handleExecuteConsole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    const cmd = consoleInput.trim();
    setConsoleLogs((prev) => [
      ...prev,
      { id: `cmd-${Date.now()}`, type: 'log', msg: `> ${cmd}`, time: new Date().toLocaleTimeString() },
    ]);

    // Try evaluation
    try {
      let result = 'undefined';
      if (cmd === 'document.title') result = '"Checkout Gate Service"';
      else if (cmd === 'location.href') result = `"${url}"`;
      else if (cmd === 'navigator.userAgent') result = `"${navigator.userAgent}"`;
      else if (cmd === 'window.innerWidth') result = String(window.innerWidth);
      else {
        const safeEval = new Function(`return (${cmd})`);
        result = String(safeEval());
      }
      setConsoleLogs((prev) => [
        ...prev,
        { id: `res-${Date.now()}`, type: 'info', msg: `< ${result}`, time: new Date().toLocaleTimeString() },
      ]);
    } catch (err: any) {
      setConsoleLogs((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, type: 'error', msg: `Uncaught EvalError: ${err.message}`, time: new Date().toLocaleTimeString() },
      ]);
    }
    setConsoleInput('');
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

        {/* Viewport switchers & DevTools button */}
        <div className="flex items-center gap-1.5 shrink-0">
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

          {/* DevTools Toggle Button */}
          <button
            type="button"
            onClick={() => setShowDevTools((prev) => !prev)}
            title="Toggle Chrome DevTools (Elements, Network, Console)"
            className={`flex h-7 items-center gap-1 rounded-control px-2 text-[11px] font-medium transition-all ${
              showDevTools
                ? 'bg-accent text-white shadow-btn'
                : 'bg-surface text-ink hover:bg-hover border border-line shadow-hairline'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span>DevTools</span>
          </button>

          {/* Viewport Modes */}
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

          {/* Open in new tab */}
          <button
            type="button"
            title="Open in new window"
            onClick={handleOpenExternal}
            className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Mode Selector Sub-bar ─── */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-surface/60 px-3 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="flex h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
          <span className="font-mono text-ink-3 text-[10px]">
            Target: <span className="text-ink font-semibold">{inputUrl}</span>
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

      {/* ─── Main Viewport + DevTools Container ─── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        {/* Top: Web Page Viewport */}
        <div className={`relative flex items-center justify-center p-2 overflow-auto ${showDevTools ? 'h-[50%]' : 'h-full'}`}>
          <div
            className={`relative h-full transition-all duration-300 flex flex-col overflow-hidden ${
              viewport === 'desktop'
                ? 'w-full'
                : 'w-[375px] max-w-full rounded-2xl border-4 border-line bg-surface shadow-2xl'
            }`}
          >
            {mode === 'live' ? (
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent mb-2">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                      </svg>
                    </div>
                    <h4 className="text-[13px] font-semibold text-ink">Previewing Live Target</h4>
                    <p className="mt-1 max-w-[320px] text-[11px] text-ink-3">
                      If your app server is still compiling on port <span className="font-mono text-accent">{selectedPort}</span>, switch to <strong className="text-ink">Interactive Mock</strong> or ask Orion to start dev server.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Interactive Sample Mock View */
              <div className="h-full w-full overflow-y-auto bg-surface p-4 text-ink flex flex-col">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green/20 text-green font-bold text-xs">
                      ⚡
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-ink leading-tight">Checkout Gate Service</h3>
                      <p className="font-mono text-[10px] text-ink-3">{repo}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-green-tint px-2 py-0.5 text-[9.5px] font-semibold text-green">
                    <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
                    Status: 200 OK
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-control border border-line bg-field p-2.5">
                    <span className="text-[10px] text-ink-3 font-medium">Rate Limit Gate</span>
                    <p className="mt-0.5 font-mono text-[14px] font-semibold text-accent">10 req / 60s</p>
                    <span className="text-[9.5px] text-green flex items-center gap-1 mt-0.5 font-mono">
                      ✓ Patched 429 Test
                    </span>
                  </div>
                  <div className="rounded-control border border-line bg-field p-2.5">
                    <span className="text-[10px] text-ink-3 font-medium">Bot Attribution</span>
                    <p className="mt-0.5 font-mono text-[13px] font-semibold text-ink">orion-bot</p>
                    <span className="text-[9.5px] text-green flex items-center gap-1 mt-0.5 font-mono">
                      ✓ GitHub Verified
                    </span>
                  </div>
                </div>

                <div className="mt-3 rounded-control border border-line bg-field p-2.5 flex-1">
                  <div className="flex items-center justify-between border-b border-line pb-1.5 mb-1.5">
                    <span className="text-[11px] font-semibold text-ink">Active Endpoints</span>
                    <span className="font-mono text-[9.5px] text-ink-3">REST / JSON</span>
                  </div>
                  <div className="flex flex-col gap-1 font-mono text-[10.5px]">
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-accent">POST /api/checkout</span>
                      <span className="rounded bg-green/20 px-1 text-[9px] text-green">200 OK</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-accent">POST /api/checkout (exceeded)</span>
                      <span className="rounded bg-orange-500/20 px-1 text-[9px] text-orange-400">429 Limit</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-accent">GET /health</span>
                      <span className="rounded bg-green/20 px-1 text-[9px] text-green">200 OK</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Bottom: CHROME DEVTOOLS PANEL (Matching User Image) ─── */}
        {showDevTools && (
          <div className="flex h-[50%] flex-col border-t border-line bg-[#202124] text-[#bdc1c6] font-mono text-[11px] overflow-hidden">
            {/* DevTools Chrome Top Strip (Elements | Console | Sources | Network | Application) */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#3c4043] bg-[#292a2d] px-2 text-[11px]">
              <div className="flex items-center gap-0.5">
                {(['Elements', 'Console', 'Sources', 'Network', 'Application', 'Chii'] as const).map((tab) => {
                  const isActive = devToolsTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDevToolsTab(tab)}
                      className={`relative px-2.5 py-1 text-[11px] font-sans transition-colors ${
                        isActive
                          ? 'text-[#e8eaed] font-medium'
                          : 'text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#35363a]'
                      }`}
                    >
                      {tab}
                      {tab === 'Network' && networkRequests.length > 0 && (
                        <span className="ml-1 text-[9.5px] text-[#8ab4f8]">({networkRequests.length})</span>
                      )}
                      {tab === 'Console' && consoleLogs.filter((l) => l.type === 'error').length > 0 && (
                        <span className="ml-1 text-[9.5px] text-[#f28b82]">
                          ({consoleLogs.filter((l) => l.type === 'error').length})
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8ab4f8]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* DevTools window controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Clear records"
                  onClick={() => {
                    if (devToolsTab === 'Network') setNetworkRequests([]);
                    if (devToolsTab === 'Console') setConsoleLogs([]);
                  }}
                  className="rounded p-1 text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#35363a]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Open Chii standalone"
                  onClick={() => window.open('http://localhost:4001', '_blank')}
                  className="rounded p-1 text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#35363a]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Close DevTools"
                  onClick={() => setShowDevTools(false)}
                  className="rounded p-1 text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#35363a]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* DevTools Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* ─── 1. ELEMENTS TAB (Matching user image: DOM Tree + Box Model) ─── */}
              {devToolsTab === 'Elements' && (
                <div className="flex h-full w-full divide-x divide-[#3c4043] overflow-hidden">
                  {/* Left: DOM Tree Inspector */}
                  <div className="flex-1 overflow-y-auto p-2.5 text-[#e8eaed] leading-relaxed">
                    <div className="text-[#8ab4f8]">&lt;!DOCTYPE html&gt;</div>
                    <div className="pl-2">
                      <span className="text-[#8ab4f8]">&lt;<span className="text-[#81c995]">html</span> <span className="text-[#fdd663]">dir</span>=<span className="text-[#8ab4f8]">"ltr"</span>&gt;</span>
                      <div className="pl-3">
                        <span className="text-[#8ab4f8]">&lt;<span className="text-[#81c995]">head</span>&gt;</span>
                        <div className="pl-3 text-[#9aa0a6]">&lt;title&gt;Checkout Gate Service&lt;/title&gt;</div>
                        <span className="text-[#8ab4f8]">&lt;/<span className="text-[#81c995]">head</span>&gt;</span>
                      </div>
                      <div className="pl-3">
                        <span className="text-[#8ab4f8]">&lt;<span className="text-[#81c995]">body</span> <span className="text-[#fdd663]">class</span>=<span className="text-[#8ab4f8]">"dark-theme"</span>&gt;</span>
                        <div
                          onClick={() => setSelectedElement('div#checkout-app')}
                          className={`pl-3 cursor-pointer rounded px-1 ${
                            selectedElement === 'div#checkout-app' ? 'bg-[#004a77] text-white' : 'hover:bg-[#35363a]'
                          }`}
                        >
                          <span className="text-[#8ab4f8]">&lt;<span className="text-[#81c995]">div</span> <span className="text-[#fdd663]">id</span>=<span className="text-[#8ab4f8]">"checkout-app"</span> <span className="text-[#fdd663]">class</span>=<span className="text-[#8ab4f8]">"flex col"</span>&gt;</span>
                        </div>
                        <div className="pl-6 text-[#9aa0a6]">&lt;header class="gate-header"&gt;...&lt;/header&gt;</div>
                        <div className="pl-6 text-[#9aa0a6]">&lt;main class="gate-content"&gt;...&lt;/main&gt;</div>
                        <div className="pl-3">
                          <span className="text-[#8ab4f8]">&lt;/<span className="text-[#81c995]">div</span>&gt;</span>
                        </div>
                        <span className="text-[#8ab4f8]">&lt;/<span className="text-[#81c995]">body</span>&gt;</span>
                      </div>
                      <span className="text-[#8ab4f8]">&lt;/<span className="text-[#81c995]">html</span>&gt;</span>
                    </div>
                  </div>

                  {/* Right: Styles & Box Model (Exact diagram from user image) */}
                  <div className="w-[280px] shrink-0 overflow-y-auto p-2 bg-[#292a2d] text-[10.5px]">
                    <div className="flex items-center justify-between border-b border-[#3c4043] pb-1.5 mb-2 text-[#e8eaed] font-sans font-medium">
                      <span>Styles</span>
                      <span className="text-[#9aa0a6]">Computed</span>
                    </div>

                    {/* The Chrome Box Model (Margin -> Border -> Padding -> Content) */}
                    <div className="my-2 flex flex-col items-center justify-center p-2 rounded bg-[#202124] border border-[#3c4043]">
                      <div className="w-full text-center text-[9px] text-[#f8cba6] pb-0.5">margin: 0</div>
                      <div className="w-[90%] bg-[#f8cba6]/15 border border-dashed border-[#f8cba6]/50 p-1.5 rounded flex flex-col items-center">
                        <div className="text-[9px] text-[#f6e7b2] pb-0.5">border: 1px</div>
                        <div className="w-[85%] bg-[#f6e7b2]/15 border border-[#f6e7b2]/50 p-1.5 rounded flex flex-col items-center">
                          <div className="text-[9px] text-[#c4e3b7] pb-0.5">padding: 16px</div>
                          <div className="w-[80%] bg-[#96c5f7]/25 border border-[#96c5f7]/60 py-1 text-center font-bold text-[#8ab4f8]">
                            720 × 440
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CSS Rules list */}
                    <div className="mt-3 flex flex-col gap-1 font-mono text-[10px]">
                      <span className="text-[#8ab4f8]">#checkout-app &#123;</span>
                      <span className="pl-3 text-[#e8eaed]">display: <span className="text-[#fdd663]">flex</span>;</span>
                      <span className="pl-3 text-[#e8eaed]">flex-direction: <span className="text-[#fdd663]">column</span>;</span>
                      <span className="pl-3 text-[#e8eaed]">background-color: <span className="text-[#81c995]">#000000</span>;</span>
                      <span className="pl-3 text-[#e8eaed]">color: <span className="text-[#81c995]">#ffffff</span>;</span>
                      <span className="text-[#8ab4f8]">&#125;</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 2. NETWORK TAB (Exact Chrome Network Waterfall Table) ─── */}
              {devToolsTab === 'Network' && (
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="flex h-6 items-center bg-[#292a2d] px-2 text-[10px] text-[#9aa0a6] border-b border-[#3c4043] font-sans">
                    <span className="w-16">Status</span>
                    <span className="w-16">Method</span>
                    <span className="flex-1">Name</span>
                    <span className="w-16">Type</span>
                    <span className="w-16">Time</span>
                    <span className="w-16 text-right">Size</span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-[#292a2d]">
                    {networkRequests.map((req) => (
                      <div
                        key={req.id}
                        onClick={() => setSelectedRequest(req)}
                        className={`flex h-6 items-center px-2 text-[10.5px] cursor-pointer font-mono ${
                          selectedRequest?.id === req.id
                            ? 'bg-[#004a77] text-white'
                            : 'hover:bg-[#292a2d] text-[#e8eaed]'
                        }`}
                      >
                        <span className={`w-16 font-semibold ${req.status === 200 ? 'text-[#81c995]' : 'text-[#f28b82]'}`}>
                          {req.status}
                        </span>
                        <span className="w-16 text-[#8ab4f8]">{req.method}</span>
                        <span className="flex-1 truncate">{req.name}</span>
                        <span className="w-16 text-[#9aa0a6]">{req.type}</span>
                        <span className="w-16 text-[#9aa0a6]">{req.time}</span>
                        <span className="w-16 text-right text-[#9aa0a6]">{req.size}</span>
                      </div>
                    ))}
                  </div>

                  {/* Selected request payload preview drawer */}
                  {selectedRequest && (
                    <div className="h-28 border-t border-[#3c4043] bg-[#292a2d] p-2 overflow-y-auto text-[10px]">
                      <div className="flex items-center justify-between pb-1 text-[#e8eaed] font-sans font-medium">
                        <span>Payload &amp; Response: {selectedRequest.name}</span>
                        <button type="button" onClick={() => setSelectedRequest(null)} className="text-[#9aa0a6] hover:text-white">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1 font-mono text-[9.5px]">
                        <div className="rounded bg-[#202124] p-1.5 border border-[#3c4043]">
                          <span className="text-[#9aa0a6]">Request Payload:</span>
                          <pre className="text-[#8ab4f8] whitespace-pre-wrap">{selectedRequest.payload || 'None'}</pre>
                        </div>
                        <div className="rounded bg-[#202124] p-1.5 border border-[#3c4043]">
                          <span className="text-[#9aa0a6]">Response Body:</span>
                          <pre className="text-[#81c995] whitespace-pre-wrap">{selectedRequest.response || 'Empty'}</pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── 3. CONSOLE TAB (Real JS Evaluation + Logs) ─── */}
              {devToolsTab === 'Console' && (
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-2 font-mono text-[10.5px] flex flex-col gap-1">
                    {consoleLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`flex items-start gap-2 py-0.5 px-1 rounded ${
                          log.type === 'error'
                            ? 'bg-[#5c1d1d]/30 text-[#f28b82] border-l-2 border-[#f28b82]'
                            : log.type === 'warn'
                            ? 'bg-[#5c471d]/30 text-[#fdd663] border-l-2 border-[#fdd663]'
                            : 'text-[#e8eaed]'
                        }`}
                      >
                        <span className="text-[#9aa0a6] shrink-0">{log.time}</span>
                        <span className="flex-1 break-words">{log.msg}</span>
                        {log.source && <span className="text-[#9aa0a6] text-[9px] shrink-0">{log.source}</span>}
                      </div>
                    ))}
                  </div>
                  {/* Console prompt input */}
                  <form onSubmit={handleExecuteConsole} className="flex h-7 shrink-0 items-center border-t border-[#3c4043] bg-[#292a2d] px-2">
                    <span className="text-[#8ab4f8] font-bold mr-1.5">&gt;</span>
                    <input
                      type="text"
                      value={consoleInput}
                      onChange={(e) => setConsoleInput(e.target.value)}
                      placeholder="Type JavaScript expression (e.g. document.title, location.href)..."
                      className="flex-1 bg-transparent text-[11px] text-[#e8eaed] outline-none placeholder:text-[#5f6368]"
                    />
                  </form>
                </div>
              )}

              {/* ─── 4. SOURCES TAB ─── */}
              {devToolsTab === 'Sources' && (
                <div className="flex h-full w-full divide-x divide-[#3c4043] overflow-hidden text-[10.5px]">
                  <div className="w-44 shrink-0 overflow-y-auto p-2 bg-[#292a2d] text-[#e8eaed]">
                    <div className="text-[#9aa0a6] uppercase text-[9px] font-sans font-bold pb-1">Workspace</div>
                    <div className="pl-1 text-[#8ab4f8]">📁 src/</div>
                    <div className="pl-4 text-[#81c995]">📄 routes/tasks.ts</div>
                    <div className="pl-4 text-[#81c995]">📄 routes/checkout.ts</div>
                    <div className="pl-1 text-[#8ab4f8]">📁 css/</div>
                    <div className="pl-4 text-[#81c995]">📄 airspace.css</div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 bg-[#202124] text-[#e8eaed]">
                    <div className="flex gap-3">
                      <div className="text-[#5f6368] select-none text-right w-6">1<br/>2<br/>3<br/>4<br/>5<br/>6</div>
                      <div className="font-mono">
                        <span className="text-[#fdd663]">import</span> &#123; FastifyInstance &#125; <span className="text-[#fdd663]">from</span> <span className="text-[#81c995]">'fastify'</span>;<br/>
                        <span className="text-[#fdd663]">export default async function</span> checkoutRoutes(app: FastifyInstance) &#123;<br/>
                        &nbsp;&nbsp;app.post(<span className="text-[#81c995]">"/api/checkout"</span>, <span className="text-[#fdd663]">async</span> (req, reply) =&gt; &#123;<br/>
                        &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-[#fdd663]">return</span> &#123; success: <span className="text-[#8ab4f8]">true</span>, rateLimitRemaining: <span className="text-[#8ab4f8]">9</span> &#125;;<br/>
                        &nbsp;&nbsp;&#125;);<br/>
                        &#125;
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 5. APPLICATION TAB ─── */}
              {devToolsTab === 'Application' && (
                <div className="flex h-full w-full divide-x divide-[#3c4043] overflow-hidden text-[10.5px]">
                  <div className="w-44 shrink-0 overflow-y-auto p-2 bg-[#292a2d] text-[#e8eaed]">
                    <div className="text-[#9aa0a6] uppercase text-[9px] font-sans font-bold pb-1">Storage</div>
                    <div className="pl-1 text-[#8ab4f8]">🗄️ Local Storage</div>
                    <div className="pl-4 text-[#81c995]">http://localhost:3000</div>
                    <div className="pl-1 text-[#8ab4f8]">🗄️ Session Storage</div>
                    <div className="pl-1 text-[#8ab4f8]">🍪 Cookies</div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 bg-[#202124]">
                    <div className="flex h-5 border-b border-[#3c4043] text-[#9aa0a6] text-[9.5px]">
                      <span className="w-40 font-bold">Key</span>
                      <span className="flex-1 font-bold">Value</span>
                    </div>
                    <div className="flex py-1 border-b border-[#292a2d]">
                      <span className="w-40 text-[#8ab4f8]">orion_session_token</span>
                      <span className="flex-1 truncate text-[#e8eaed]">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</span>
                    </div>
                    <div className="flex py-1 border-b border-[#292a2d]">
                      <span className="w-40 text-[#8ab4f8]">orion_theme</span>
                      <span className="flex-1 text-[#81c995]">"dark"</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 6. CHII STANDALONE EMBED TAB ─── */}
              {devToolsTab === 'Chii' && (
                <div className="relative h-full w-full bg-[#202124]">
                  <iframe
                    src="http://localhost:4001"
                    title="Chii Chrome DevTools Remote Target"
                    className="h-full w-full border-none"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
