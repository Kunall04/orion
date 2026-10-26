import { useState, useRef, useEffect } from 'react';

export interface AppPreviewProps {
  sessionId?: string;
  sandboxPort?: number;
  repo?: string;
  onRunCommand?: (command: string) => void;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type DevToolsTab = 'Elements' | 'Console' | 'Sources' | 'Network' | 'Performance' | 'Memory' | 'Application' | 'Security';

interface NetworkRequestItem {
  id: string;
  name: string;
  status: number | 'FAIL';
  type: string;
  initiator: string;
  size: string;
  time: string;
  waterfallOffset: number; // in percentage (0 - 80)
  waterfallWidth: number; // in percentage (5 - 30)
  waterfallColor: 'green' | 'blue' | 'orange' | 'purple';
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

// Matching the exact rows and structure from Chrome DevTools screenshot (Image 2)
const CHROME_NETWORK_REQUESTS: NetworkRequestItem[] = [
  {
    id: 'req-1',
    name: 'indicator',
    status: 304,
    type: 'fetch',
    initiator: 'index-DRotaQBD.js:4',
    size: '5.9 kB',
    time: '324 ms',
    waterfallOffset: 2,
    waterfallWidth: 14,
    waterfallColor: 'blue',
  },
  {
    id: 'req-2',
    name: '_sidebar',
    status: 304,
    type: 'fetch',
    initiator: 'index-DRotaQBD.js:4',
    size: '5.9 kB',
    time: '422 ms',
    waterfallOffset: 12,
    waterfallWidth: 18,
    waterfallColor: 'green',
  },
  {
    id: 'req-3',
    name: 'chat?skip_anchor=true',
    status: 304,
    type: 'fetch',
    initiator: 'index-DRotaQBD.js:4',
    size: '5.9 kB',
    time: '422 ms',
    waterfallOffset: 15,
    waterfallWidth: 18,
    waterfallColor: 'orange',
  },
  {
    id: 'req-4',
    name: 'rum?ddforward=%2Fapi%2Fv2%2Frum%3Fddsource%3Dbrows...te%26batch_time%3D1...',
    status: 202,
    type: 'fetch',
    initiator: 'main-DjBvoiJ_.js:6',
    size: '0.9 kB',
    time: '311 ms',
    waterfallOffset: 28,
    waterfallWidth: 12,
    waterfallColor: 'green',
  },
  {
    id: 'req-5',
    name: 'rum?ddforward=%2Fapi%2Fv2%2Frum%3Fddsource%3Dbrows...te%26batch_time%3D1...',
    status: 202,
    type: 'fetch',
    initiator: 'main-DjBvoiJ_.js:6',
    size: '0.9 kB',
    time: '317 ms',
    waterfallOffset: 34,
    waterfallWidth: 12,
    waterfallColor: 'blue',
  },
  {
    id: 'req-6',
    name: 'rum?ddforward=%2Fapi%2Fv2%2Frum%3Fddsource%3Dbrows...te%26batch_time%3D1...',
    status: 202,
    type: 'fetch',
    initiator: 'main-DjBvoiJ_.js:6',
    size: '0.9 kB',
    time: '399 ms',
    waterfallOffset: 40,
    waterfallWidth: 15,
    waterfallColor: 'green',
  },
  {
    id: 'req-7',
    name: 'rum?ddforward=%2Fapi%2Fv2%2Frum%3Fddsource%3Dbrows...te%26batch_time%3D1...',
    status: 202,
    type: 'fetch',
    initiator: 'main-DjBvoiJ_.js:6',
    size: '0.9 kB',
    time: '396 ms',
    waterfallOffset: 48,
    waterfallWidth: 15,
    waterfallColor: 'purple',
  },
  {
    id: 'req-8',
    name: 'rum?ddforward=%2Fapi%2Fv2%2Frum%3Fddsource%3Dbrows...te%26batch_time%3D1...',
    status: 202,
    type: 'fetch',
    initiator: 'main-DjBvoiJ_.js:6',
    size: '0.9 kB',
    time: '411 ms',
    waterfallOffset: 55,
    waterfallWidth: 16,
    waterfallColor: 'green',
  },
  {
    id: 'req-9',
    name: 'chat',
    status: 304,
    type: 'fetch',
    initiator: 'index-DRotaQBD.js:4',
    size: '5.9 kB',
    time: '416 ms',
    waterfallOffset: 65,
    waterfallWidth: 20,
    waterfallColor: 'green',
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
  const [url, setUrl] = useState<string>(`http://localhost:3000/`);
  const [inputUrl, setInputUrl] = useState<string>(`http://localhost:3000/`);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [mode, setMode] = useState<'live' | 'sample'>('sample');
  const [iframeLoaded, setIframeLoaded] = useState<boolean>(false);
  const [showDevTools, setShowDevTools] = useState<boolean>(true);
  const [devToolsTab, setDevToolsTab] = useState<DevToolsTab>('Network');
  const [networkRequests, setNetworkRequests] = useState<NetworkRequestItem[]>(CHROME_NETWORK_REQUESTS);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogItem[]>(DEFAULT_CONSOLE_LOGS);
  const [consoleInput, setConsoleInput] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequestItem | null>(null);
  const [selectedElement, setSelectedElement] = useState<string>('div#checkout-app');
  const [filterText, setFilterText] = useState<string>('');
  const [disableCache, setDisableCache] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for message events from injected spy script
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'ORION_NETWORK_EVENT' && isRecording) {
        const item: NetworkRequestItem = {
          id: `req-${Date.now()}-${Math.random()}`,
          name: e.data.request.url || '/api/request',
          status: e.data.request.status || 200,
          type: 'fetch',
          initiator: 'bundle.js:12',
          size: '640 B',
          time: `${e.data.request.time || 24} ms`,
          waterfallOffset: Math.min(80, Math.floor(Math.random() * 60)),
          waterfallWidth: 15,
          waterfallColor: e.data.request.status === 200 ? 'green' : 'orange',
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
  }, [isRecording]);

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

  const filteredRequests = networkRequests.filter((r) =>
    r.name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="flex h-full w-full flex-col bg-[#202124] text-[#e8eaed] select-none overflow-hidden font-sans">
      {/* ─── Top Chrome Browser Bar (Clean Chrome Style - NO Port Numbers) ─── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#3c4043] bg-[#292a2d] px-3 gap-2">
        {/* Navigation buttons: < > ⟳ */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Back"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#9aa0a6] hover:bg-[#35363a] hover:text-[#e8eaed] disabled:opacity-40 transition-colors"
            disabled
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            title="Forward"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#9aa0a6] hover:bg-[#35363a] hover:text-[#e8eaed] disabled:opacity-40 transition-colors"
            disabled
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            type="button"
            title="Reload this page"
            onClick={handleReload}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[#9aa0a6] hover:bg-[#35363a] hover:text-[#e8eaed] transition-colors ${
              isReloading ? 'animate-spin text-[#8ab4f8]' : ''
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
        </div>

        {/* Clean URL Address Bar */}
        <form onSubmit={handleUrlSubmit} className="flex min-w-0 flex-1 items-center">
          <div className="flex h-7 w-full items-center gap-2 rounded-full border border-transparent bg-[#202124] px-3 transition-colors focus-within:border-[#8ab4f8] focus-within:bg-[#202124]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#81c995] shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Search Google or type a URL"
              className="min-w-0 flex-1 bg-transparent font-sans text-[12px] text-[#e8eaed] outline-none placeholder:text-[#5f6368]"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              title={copied ? 'Copied URL!' : 'Copy link'}
              className="flex h-5 items-center gap-1 rounded px-1 text-[10px] text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
            >
              {copied ? (
                <span className="text-[#81c995] font-medium">Copied!</span>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {/* Right side controls: Toggle DevTools & Viewports */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Toggle DevTools Button */}
          <button
            type="button"
            onClick={() => setShowDevTools((prev) => !prev)}
            title="Toggle Chrome DevTools (Network, Elements, Console)"
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-all ${
              showDevTools
                ? 'bg-[#8ab4f8] text-[#202124] font-semibold'
                : 'bg-[#35363a] text-[#e8eaed] hover:bg-[#3c4043]'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span>DevTools</span>
          </button>

          {/* Viewport switchers */}
          <div className="flex items-center rounded-full bg-[#202124] p-0.5 border border-[#3c4043]">
            <button
              type="button"
              title="Desktop viewport"
              onClick={() => setViewport('desktop')}
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                viewport === 'desktop' ? 'bg-[#35363a] text-[#8ab4f8]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'
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
              title="Mobile viewport"
              onClick={() => setViewport('mobile')}
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                viewport === 'mobile' ? 'bg-[#35363a] text-[#8ab4f8]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </button>
          </div>

          {/* Popout in dedicated window */}
          <button
            type="button"
            title="Open in new window"
            onClick={handleOpenExternal}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#9aa0a6] hover:bg-[#35363a] hover:text-[#e8eaed] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Main Viewport + Chrome DevTools Split View ─── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#202124]">
        {/* Top: Web Page Viewport */}
        <div className={`relative flex items-center justify-center p-2 overflow-auto ${showDevTools ? 'h-[45%]' : 'h-full'}`}>
          <div
            className={`relative h-full transition-all duration-300 flex flex-col overflow-hidden ${
              viewport === 'desktop'
                ? 'w-full'
                : 'w-[375px] max-w-full rounded-2xl border-4 border-[#3c4043] bg-[#292a2d] shadow-2xl'
            }`}
          >
            {mode === 'live' ? (
              <div className="relative h-full w-full bg-white">
                {isReloading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#202124]/80 backdrop-blur-xs">
                    <div className="flex items-center gap-2 rounded bg-[#292a2d] px-3 py-1.5 text-xs font-medium text-[#e8eaed] shadow-card border border-[#3c4043]">
                      <svg className="h-3.5 w-3.5 animate-spin text-[#8ab4f8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Loading page...
                    </div>
                  </div>
                )}
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  src={url}
                  title="Application Preview"
                  onLoad={() => setIframeLoaded(true)}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  className="h-full w-full border-none"
                />
              </div>
            ) : (
              /* Interactive Sample Mock View */
              <div className="h-full w-full overflow-y-auto bg-[#202124] p-4 text-[#e8eaed] flex flex-col">
                <div className="flex items-center justify-between border-b border-[#3c4043] pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-[#81c995]/20 text-[#81c995] font-bold text-xs">
                      ⚡
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-[#e8eaed] leading-tight">Checkout Gate Service</h3>
                      <p className="font-mono text-[10px] text-[#9aa0a6]">{repo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('live')}
                      className="rounded bg-[#35363a] px-2 py-0.5 text-[10px] text-[#8ab4f8] hover:bg-[#3c4043]"
                    >
                      Switch to Live Iframe
                    </button>
                    <span className="flex items-center gap-1 rounded-full bg-[#81c995]/15 px-2 py-0.5 text-[9.5px] font-semibold text-[#81c995]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#81c995] animate-pulse" />
                      200 OK
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-[#3c4043] bg-[#292a2d] p-2.5">
                    <span className="text-[10px] text-[#9aa0a6]">Rate Limit Window</span>
                    <p className="mt-0.5 font-mono text-[14px] font-semibold text-[#8ab4f8]">10 req / 60s</p>
                    <span className="text-[9.5px] text-[#81c995] font-mono mt-0.5 block">✓ 429 Test Patched</span>
                  </div>
                  <div className="rounded border border-[#3c4043] bg-[#292a2d] p-2.5">
                    <span className="text-[10px] text-[#9aa0a6]">Commit Attribution</span>
                    <p className="mt-0.5 font-mono text-[13px] font-semibold text-[#e8eaed]">orion-bot</p>
                    <span className="text-[9.5px] text-[#81c995] font-mono mt-0.5 block">✓ GitHub Verified</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Bottom: CHROME DEVTOOLS (Matching EXACTLY Image 2) ─── */}
        {showDevTools && (
          <div className="flex h-[55%] flex-col border-t border-[#3c4043] bg-[#202124] text-[#bdc1c6] font-mono text-[11px] overflow-hidden">
            {/* DevTools Top Tab Strip (Exact order: Elements | Console | Sources | Network | Performance...) */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#3c4043] bg-[#292a2d] px-2 text-[11px] font-sans">
              <div className="flex items-center gap-0.5">
                {/* Element inspect icon */}
                <button type="button" title="Select an element in the page to inspect it" className="p-1 text-[#9aa0a6] hover:text-[#e8eaed] mr-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l7 7m0 0l-7 7m7-7h11" />
                  </svg>
                </button>
                {/* Device toggle icon */}
                <button type="button" title="Toggle device toolbar" className="p-1 text-[#9aa0a6] hover:text-[#e8eaed] mr-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </button>

                {(['Elements', 'Console', 'Sources', 'Network', 'Performance', 'Memory', 'Application', 'Security'] as const).map((tab) => {
                  const isActive = devToolsTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDevToolsTab(tab)}
                      className={`relative px-2 py-1 text-[11px] font-sans transition-colors ${
                        isActive
                          ? 'text-[#e8eaed] font-medium'
                          : 'text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#35363a]'
                      }`}
                    >
                      {tab}
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8ab4f8]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* DevTools top right controls (Red error badge, settings, close) */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded bg-[#f28b82]/20 px-1 text-[9.5px] font-bold text-[#f28b82]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#f28b82]" />
                  1
                </span>
                <button type="button" title="Customize and control DevTools" className="text-[#9aa0a6] hover:text-[#e8eaed]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Close DevTools"
                  onClick={() => setShowDevTools(false)}
                  className="text-[#9aa0a6] hover:text-[#e8eaed]"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ─── EXACT CHROME NETWORK TAB (Matching Image 2) ─── */}
            {devToolsTab === 'Network' && (
              <div className="flex flex-1 flex-col overflow-hidden bg-[#202124]">
                {/* Row 2: Chrome DevTools Action Bar (Record, Clear, Filter, Checkboxes) */}
                <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[#3c4043] bg-[#292a2d] px-2 text-[10.5px] font-sans">
                  {/* Record button */}
                  <button
                    type="button"
                    onClick={() => setIsRecording((prev) => !prev)}
                    title={isRecording ? 'Stop recording network log' : 'Record network log'}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:opacity-80"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${isRecording ? 'bg-[#f28b82]' : 'bg-[#9aa0a6]'}`} />
                  </button>
                  {/* Clear button ⊘ */}
                  <button
                    type="button"
                    onClick={() => setNetworkRequests([])}
                    title="Clear"
                    className="text-[#9aa0a6] hover:text-[#e8eaed] text-xs font-bold mr-1"
                  >
                    ⊘
                  </button>

                  <div className="h-3 w-px bg-[#3c4043]" />

                  {/* Filter icon & input */}
                  <div className="flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#8ab4f8]">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <input
                      type="text"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder="Filter"
                      className="h-5 w-28 rounded bg-[#202124] px-1.5 text-[10.5px] text-[#e8eaed] outline-none border border-[#3c4043] focus:border-[#8ab4f8]"
                    />
                  </div>

                  <div className="h-3 w-px bg-[#3c4043]" />

                  {/* Keep log & Disable cache checkboxes */}
                  <label className="flex items-center gap-1 text-[#9aa0a6] cursor-pointer hover:text-[#e8eaed]">
                    <input type="checkbox" className="h-3 w-3 accent-[#8ab4f8] rounded" />
                    <span>Invert</span>
                  </label>
                  <label className="flex items-center gap-1 text-[#9aa0a6] cursor-pointer hover:text-[#e8eaed]">
                    <input type="checkbox" className="h-3 w-3 accent-[#8ab4f8] rounded" />
                    <span>Hide data URLs</span>
                  </label>
                  <label className="flex items-center gap-1 text-[#9aa0a6] cursor-pointer hover:text-[#e8eaed]">
                    <input
                      type="checkbox"
                      checked={disableCache}
                      onChange={(e) => setDisableCache(e.target.checked)}
                      className="h-3 w-3 accent-[#8ab4f8] rounded"
                    />
                    <span>Disable cache</span>
                  </label>

                  {/* No throttling dropdown */}
                  <div className="ml-auto flex items-center gap-1 text-[#9aa0a6]">
                    <span>No throttling ▾</span>
                  </div>
                </div>

                {/* Row 3: Chrome DevTools Waterfall Timeline Ruler */}
                <div className="relative h-14 shrink-0 border-b border-[#3c4043] bg-[#202124] overflow-hidden select-none">
                  {/* Timeline millisecond axis ticks */}
                  <div className="absolute top-0 left-0 right-0 h-4 border-b border-[#3c4043]/40 flex text-[9px] text-[#5f6368] font-sans px-2">
                    <span className="w-[12.5%]">500 ms</span>
                    <span className="w-[12.5%]">1,000 ms</span>
                    <span className="w-[12.5%]">1,500 ms</span>
                    <span className="w-[12.5%]">2,000 ms</span>
                    <span className="w-[12.5%]">2,500 ms</span>
                    <span className="w-[12.5%]">3,000 ms</span>
                    <span className="w-[12.5%]">3,500 ms</span>
                    <span className="w-[12.5%]">4,000 ms</span>
                  </div>

                  {/* Colored Timeline Activity Bars */}
                  <div className="absolute top-5 left-0 right-0 bottom-0 p-1 flex flex-col gap-0.5 justify-center">
                    <div className="relative h-1.5 w-full bg-[#292a2d]/40 rounded">
                      <span className="absolute left-[3%] w-[15%] h-full bg-[#81c995] rounded-xs" />
                      <span className="absolute left-[18%] w-[22%] h-full bg-[#8ab4f8] rounded-xs" />
                      <span className="absolute left-[45%] w-[12%] h-full bg-[#fdd663] rounded-xs" />
                      <span className="absolute left-[65%] w-[25%] h-full bg-[#81c995] rounded-xs" />
                    </div>
                    <div className="relative h-1.5 w-full bg-[#292a2d]/40 rounded">
                      <span className="absolute left-[8%] w-[25%] h-full bg-[#8ab4f8] rounded-xs" />
                      <span className="absolute left-[36%] w-[18%] h-full bg-[#81c995] rounded-xs" />
                      <span className="absolute left-[70%] w-[10%] h-full bg-[#81c995] rounded-xs" />
                    </div>
                  </div>
                </div>

                {/* Row 4: Exact Chrome Network Table Columns */}
                <div className="flex h-5 shrink-0 items-center border-b border-[#3c4043] bg-[#292a2d] px-2 text-[10px] text-[#9aa0a6] font-sans font-medium">
                  <span className="w-[42%] truncate">Name</span>
                  <span className="w-14 truncate">Status</span>
                  <span className="w-14 truncate">Type</span>
                  <span className="w-32 truncate">Initiator</span>
                  <span className="w-16 truncate text-right">Size</span>
                  <span className="w-16 truncate text-right">Time</span>
                  <span className="w-24 pl-3 truncate">Waterfall</span>
                </div>

                {/* Network Table Rows */}
                <div className="flex-1 overflow-y-auto divide-y divide-[#292a2d]/60 font-sans text-[10.5px]">
                  {filteredRequests.map((req) => (
                    <div
                      key={req.id}
                      onClick={() => setSelectedRequest(req)}
                      className={`flex h-5 items-center px-2 cursor-pointer transition-colors ${
                        selectedRequest?.id === req.id
                          ? 'bg-[#004a77] text-white'
                          : 'hover:bg-[#28292c] text-[#e8eaed]'
                      }`}
                    >
                      {/* Name with { } fetch icon */}
                      <div className="flex w-[42%] items-center gap-1.5 truncate pr-2">
                        <span className="text-[#f2994a] text-[9.5px] font-mono shrink-0">&lt;&gt;</span>
                        <span className="truncate">{req.name}</span>
                      </div>
                      {/* Status */}
                      <span className="w-14 truncate text-[#e8eaed]">{req.status}</span>
                      {/* Type */}
                      <span className="w-14 truncate text-[#9aa0a6]">{req.type}</span>
                      {/* Initiator (Blue link) */}
                      <span className="w-32 truncate text-[#8ab4f8] underline-offset-2 hover:underline">
                        {req.initiator}
                      </span>
                      {/* Size */}
                      <span className="w-16 truncate text-right text-[#9aa0a6]">{req.size}</span>
                      {/* Time */}
                      <span className="w-16 truncate text-right text-[#9aa0a6]">{req.time}</span>
                      {/* Waterfall mini indicator */}
                      <div className="relative w-24 h-2 ml-3 bg-[#292a2d] rounded-xs overflow-hidden">
                        <span
                          style={{
                            left: `${req.waterfallOffset}%`,
                            width: `${req.waterfallWidth}%`,
                          }}
                          className={`absolute top-0 bottom-0 rounded-xs ${
                            req.waterfallColor === 'green'
                              ? 'bg-[#81c995]'
                              : req.waterfallColor === 'blue'
                              ? 'bg-[#8ab4f8]'
                              : req.waterfallColor === 'orange'
                              ? 'bg-[#fdd663]'
                              : 'bg-[#c58af9]'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Row 5: Exact Chrome DevTools Footer Status Line */}
                <div className="flex h-5 shrink-0 items-center justify-between border-t border-[#3c4043] bg-[#292a2d] px-2 text-[9.5px] text-[#9aa0a6] font-sans">
                  <span>
                    {filteredRequests.length} / 308 requests &nbsp;|&nbsp; 28.3 kB / 69.2 kB transferred &nbsp;|&nbsp; 16.9 kB / 13,599 kB resources
                  </span>
                  <span>
                    Finish: 6.99 s &nbsp;|&nbsp; <strong className="text-[#8ab4f8] font-normal">DOMContentLoaded: 781 ms</strong> &nbsp;|&nbsp; <strong className="text-[#f28b82] font-normal">Load: 975 ms</strong>
                  </span>
                </div>
              </div>
            )}

            {/* ─── 2. ELEMENTS TAB (DOM Tree + Box Model) ─── */}
            {devToolsTab === 'Elements' && (
              <div className="flex h-full w-full divide-x divide-[#3c4043] overflow-hidden">
                <div className="flex-1 overflow-y-auto p-2 text-[#e8eaed] leading-relaxed text-[11px]">
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
                        <span className="text-[#8ab4f8]">&lt;<span className="text-[#81c995]">div</span> <span className="text-[#fdd663]">id</span>=<span className="text-[#8ab4f8]">"checkout-app"</span>&gt;</span>
                      </div>
                      <div className="pl-6 text-[#9aa0a6]">&lt;header class="navbar"&gt;...&lt;/header&gt;</div>
                      <div className="pl-6 text-[#9aa0a6]">&lt;main class="content"&gt;...&lt;/main&gt;</div>
                      <div className="pl-3">
                        <span className="text-[#8ab4f8]">&lt;/<span className="text-[#81c995]">div</span>&gt;</span>
                      </div>
                      <span className="text-[#8ab4f8]">&lt;/<span className="text-[#81c995]">body</span>&gt;</span>
                    </div>
                    <span className="text-[#8ab4f8]">&lt;/<span className="text-[#81c995]">html</span>&gt;</span>
                  </div>
                </div>

                {/* Right: Styles & Box Model */}
                <div className="w-[260px] shrink-0 overflow-y-auto p-2 bg-[#292a2d] text-[10px]">
                  <div className="flex items-center justify-between border-b border-[#3c4043] pb-1 mb-2 text-[#e8eaed] font-sans font-medium">
                    <span>Styles</span>
                    <span className="text-[#9aa0a6]">Computed</span>
                  </div>
                  {/* Chrome Box Model */}
                  <div className="my-1 flex flex-col items-center justify-center p-2 rounded bg-[#202124] border border-[#3c4043]">
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
                </div>
              </div>
            )}

            {/* ─── 3. CONSOLE TAB (JS Evaluation + Logs) ─── */}
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
                <form onSubmit={handleExecuteConsole} className="flex h-7 shrink-0 items-center border-t border-[#3c4043] bg-[#292a2d] px-2">
                  <span className="text-[#8ab4f8] font-bold mr-1.5">&gt;</span>
                  <input
                    type="text"
                    value={consoleInput}
                    onChange={(e) => setConsoleInput(e.target.value)}
                    placeholder="Type JavaScript expression..."
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
                </div>
                <div className="flex-1 overflow-y-auto p-2 bg-[#202124] text-[#e8eaed]">
                  <div className="font-mono">
                    <span className="text-[#fdd663]">import</span> &#123; FastifyInstance &#125; <span className="text-[#fdd663]">from</span> <span className="text-[#81c995]">'fastify'</span>;<br/>
                    <span className="text-[#fdd663]">export default async function</span> checkoutRoutes(app: FastifyInstance) &#123;<br/>
                    &nbsp;&nbsp;app.post(<span className="text-[#81c995]">"/api/checkout"</span>, <span className="text-[#fdd663]">async</span> (req, reply) =&gt; &#123;<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-[#fdd663]">return</span> &#123; success: <span className="text-[#8ab4f8]">true</span> &#125;;<br/>
                    &nbsp;&nbsp;&#125;);<br/>
                    &#125;
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
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
