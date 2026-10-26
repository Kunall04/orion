import Fastify, { type FastifyInstance } from 'fastify';
import type { TaskStatus } from '@cloud-agent/shared';
import { createAppJwt, loadGitHubPrivateKey, mintInstallationToken } from './github/auth';
import { listInstallationRepos } from './github/repos';
import { executeTask } from './agent/task-runner';
import type { AgentEvent } from './agent/loop';
import { SessionManager } from './session/manager';
import { SandboxClient } from './sandbox/client';

export interface InstallationRecord {
  installationId: string;
  createdAt: number;
  setupAction?: string;
}

export interface TaskRecord {
  id: string;
  instruction: string;
  sessionId?: string;
  sandboxUrl?: string;
  repo?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  events: AgentEvent[];
  result?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BackendAppOptions {
  /** Optional store for installations (defaults to in-memory Map) */
  installations?: Map<string, InstallationRecord>;
  /** Optional store for tasks (defaults to in-memory Map) */
  tasks?: Map<string, TaskRecord>;
  /** GitHub App ID */
  githubAppId?: string;
  /** GitHub App Private Key (PEM format) */
  githubPrivateKey?: string;
  /** Custom fetch implementation for testing */
  fetch?: typeof fetch;
  /** GitHub API base URL (defaults to https://api.github.com) */
  githubBaseUrl?: string;
  /** Auto-execute tasks in background (defaults to true) */
  autoExecuteTasks?: boolean;
  /** Optional SessionManager for multi-session sandbox isolation */
  sessionManager?: SessionManager;
}

/**
 * App factory — no port binding here, so tests can build the app in-memory
 * and hit routes with `inject()` instead of opening a socket.
 */
export function buildApp(options: BackendAppOptions = {}): FastifyInstance {
  const installations = options.installations ?? new Map<string, InstallationRecord>();
  const tasks = options.tasks ?? new Map<string, TaskRecord>();
  const sessionManager =
    options.sessionManager ??
    new SessionManager({
      clientFactory: (url) => new SandboxClient({ baseUrl: url, fetch: options.fetch }),
    });
  const eventListeners = new Map<string, Set<(event: AgentEvent) => void>>();
  const autoExecute = options.autoExecuteTasks ?? true;

  const app = Fastify({ logger: false });

  // CORS support
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-task-id');
    if (req.method === 'OPTIONS') {
      return reply.status(200).send();
    }
  });

  app.get('/health', async () => {
    const status: TaskStatus = 'running';
    return { ok: true, service: 'backend', status };
  });

  app.get('/ping', async () => {
    return { pong: true };
  });

  /**
   * List all tasks
   */
  app.get('/tasks', async () => {
    return {
      ok: true,
      tasks: Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt),
    };
  });

  /**
   * Get single task
   */
  app.get<{ Params: { id: string } }>('/tasks/:id', async (req, reply) => {
    const task = tasks.get(req.params.id);
    if (!task) {
      return reply.status(404).send({ ok: false, error: 'Task not found' });
    }
    return { ok: true, task };
  });

  /**
   * Server-Sent Events stream for live task progress
   */
  app.get<{ Params: { id: string } }>('/tasks/:id/events', async (req, reply) => {
    const { id } = req.params;
    const task = tasks.get(id);
    if (!task) {
      return reply.status(404).send({ ok: false, error: 'Task not found' });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    // Send existing accumulated events first
    for (const evt of task.events) {
      reply.raw.write(`data: ${JSON.stringify(evt)}\n\n`);
    }

    if (task.status === 'completed' || task.status === 'failed') {
      reply.raw.write(`data: ${JSON.stringify({ type: 'done', status: task.status, result: task.result })}\n\n`);
      reply.raw.end();
      return;
    }

    // Register listener for new live events
    if (!eventListeners.has(id)) {
      eventListeners.set(id, new Set());
    }
    const listeners = eventListeners.get(id)!;

    const listener = (event: AgentEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    listeners.add(listener);

    req.raw.on('close', () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        eventListeners.delete(id);
      }
    });
  });

  /**
   * List active sessions
   */
  app.get('/sessions', async () => {
    return {
      ok: true,
      sessions: sessionManager.listSessions().map((s) => ({
        id: s.id,
        repo: s.repo,
        sandbox: s.sandbox,
        createdAt: s.createdAt,
      })),
    };
  });

  /**
   * Create or retrieve a session with a dedicated sandbox
   */
  app.post<{ Body: { id: string; repo?: string } }>(
    '/sessions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', minLength: 1 },
            repo: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { id, repo } = req.body;
      const session = await sessionManager.getOrCreateSession(id, repo);
      return {
        ok: true,
        session: {
          id: session.id,
          repo: session.repo,
          sandbox: session.sandbox,
          createdAt: session.createdAt,
        },
      };
    },
  );

  /**
   * Get single session details
   */
  app.get<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return reply.status(404).send({ ok: false, error: 'Session not found' });
    }
    return {
      ok: true,
      session: {
        id: session.id,
        repo: session.repo,
        sandbox: session.sandbox,
        createdAt: session.createdAt,
      },
    };
  });

  /**
   * Terminate session and release its sandbox
   */
  app.delete<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const terminated = await sessionManager.terminateSession(req.params.id);
    if (!terminated) {
      return reply.status(404).send({ ok: false, error: 'Session not found' });
    }
    return { ok: true, terminated: true };
  });

  /**
   * Terminal execution: runs commands inside the session sandbox.
   */
  app.post<{ Body: { command: string; sessionId?: string } }>(
    '/api/terminal',
    {
      schema: {
        body: {
          type: 'object',
          required: ['command'],
          properties: {
            command: { type: 'string', minLength: 1 },
            sessionId: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { command, sessionId } = req.body;
      const targetSessionId = sessionId || 's1';
      let session = sessionManager.getSession(targetSessionId);
      if (!session) {
        session = await sessionManager.getOrCreateSession(targetSessionId);
      }
      if (!session?.client) {
        return reply.status(404).send({ ok: false, error: 'Session sandbox not found' });
      }

      try {
        const trimmed = command.trim();
        let cmdToRun = trimmed;
        if (/^(npm\s+(run\s+)?(dev|start)|yarn\s+(dev|start)|pnpm\s+(dev|start))$/.test(trimmed)) {
          cmdToRun = `${trimmed} > /tmp/dev-server.log 2>&1 &`;
        }

        const output = await session.client.runCommand(cmdToRun);
        const finalOutput =
          cmdToRun !== trimmed
            ? `[Started dev server in background]\n$ ${trimmed}\nServer running on port 3000. Logs routed to /tmp/dev-server.log`
            : output;
        return { ok: true, output: finalOutput };
      } catch (err: any) {
        return reply.status(500).send({ ok: false, error: err.message });
      }
    },
  );

  /**
   * List files in the sandbox workspace for the Monaco IDE
   */
  app.get<{ Params: { id: string } }>('/sessions/:id/files', async (req, reply) => {
    const sessionId = req.params.id;
    let session = sessionManager.getSession(sessionId);
    if (!session) {
      session = await sessionManager.getOrCreateSession(sessionId);
    }
    if (!session?.client) {
      return reply.status(404).send({ ok: false, error: 'Session sandbox not found' });
    }

    try {
      const output = await session.client.runCommand(
        'find . -maxdepth 4 -not -path "*/.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/build/*" -type f | head -100',
      );
      const paths = output
        .split('\n')
        .map((p) => p.trim().replace(/^\.\//, ''))
        .filter((p) => p.length > 0 && !p.startsWith('Error:'));
      return { ok: true, files: paths };
    } catch (err: any) {
      return reply.status(500).send({ ok: false, error: err.message, files: [] });
    }
  });

  /**
   * Read file content from the sandbox workspace
   */
  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    '/sessions/:id/file',
    async (req, reply) => {
      const sessionId = req.params.id;
      const filePath = req.query.path;
      if (!filePath) {
        return reply.status(400).send({ ok: false, error: 'File path is required' });
      }
      let session = sessionManager.getSession(sessionId);
      if (!session) {
        session = await sessionManager.getOrCreateSession(sessionId);
      }
      if (!session?.client) {
        return reply.status(404).send({ ok: false, error: 'Session sandbox not found' });
      }

      try {
        const content = await session.client.readFile(filePath);
        return { ok: true, path: filePath, content };
      } catch (err: any) {
        return reply.status(500).send({ ok: false, error: err.message });
      }
    },
  );

  /**
   * Save file content into the sandbox workspace
   */
  app.post<{ Params: { id: string }; Body: { path: string; content: string } }>(
    '/sessions/:id/file',
    async (req, reply) => {
      const sessionId = req.params.id;
      const { path: filePath, content } = req.body || {};
      if (!filePath) {
        return reply.status(400).send({ ok: false, error: 'File path is required' });
      }
      let session = sessionManager.getSession(sessionId);
      if (!session) {
        session = await sessionManager.getOrCreateSession(sessionId);
      }
      if (!session?.client) {
        return reply.status(404).send({ ok: false, error: 'Session sandbox not found' });
      }

      try {
        const output = await session.client.writeFile(filePath, content ?? '');
        return { ok: true, output };
      } catch (err: any) {
        return reply.status(500).send({ ok: false, error: err.message });
      }
    },
  );

  /**
   * Preview status check: reports whether a session's sandbox dev server is reachable
   */
  app.get<{ Params: { id: string }; Querystring: { port?: string } }>(
    '/preview/:id/status',
    async (req, reply) => {
      const sessionId = req.params.id;
      const port = Number(req.query.port ?? 3000);
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        return reply.status(404).send({
          ok: false,
          error: `Session ${sessionId} not found`,
        });
      }

      let running = false;
      try {
        const fetchFn = options.fetch ?? fetch;
        const probe = await fetchFn(`http://127.0.0.1:${port}/`, {
          method: 'HEAD',
        });
        running = probe.ok || probe.status < 500;
      } catch {
        running = false;
      }

      return {
        ok: true,
        sessionId,
        port,
        running,
        sandbox: {
          id: session.sandbox.id,
          port: session.sandbox.port,
          status: session.sandbox.status,
        },
      };
    },
  );

  /**
   * Reverse proxy: forwards requests from /preview/:id/:port/* directly
   * to the web application port running inside the sandbox container.
   */
  app.all<{ Params: { id: string; port: string; '*': string } }>(
    '/preview/:id/:port/*',
    async (req, reply) => {
      const sessionId = req.params.id;
      const port = req.params.port;
      const wildcard = req.params['*'] ?? '';
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        return reply.status(404).send({
          ok: false,
          error: `Session ${sessionId} not found`,
        });
      }

      const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const targetUrl = `http://127.0.0.1:${port}/${wildcard}${queryString}`;

      try {
        const fetchFn = options.fetch ?? fetch;
        const res = await fetchFn(targetUrl, {
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${port}`,
          } as any,
          body:
            req.method !== 'GET' && req.method !== 'HEAD' && req.body
              ? typeof req.body === 'string'
                ? req.body
                : JSON.stringify(req.body)
              : undefined,
        });

        reply.status(res.status);
        for (const [key, val] of res.headers.entries()) {
          if (
            key.toLowerCase() !== 'content-encoding' &&
            key.toLowerCase() !== 'content-length' &&
            key.toLowerCase() !== 'x-frame-options' &&
            key.toLowerCase() !== 'content-security-policy'
          ) {
            reply.header(key, val);
          }
        }
        reply.header('x-frame-options', 'ALLOWALL');

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          let html = await res.text();
          const spyScript = `<script>
(function(){
  try {
    var of = window.fetch;
    if (of) {
      window.fetch = async function(...args) {
        var t0 = performance.now();
        var u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        try {
          var resp = await of.apply(this, args);
          var dur = Math.round(performance.now() - t0);
          window.parent.postMessage({ type: 'ORION_NETWORK_EVENT', request: { url: u, status: resp.status, time: dur } }, '*');
          return resp;
        } catch(e) {
          var dur = Math.round(performance.now() - t0);
          window.parent.postMessage({ type: 'ORION_NETWORK_EVENT', request: { url: u, status: 502, time: dur } }, '*');
          throw e;
        }
      };
    }
  } catch(e){}
})();
</script>`;
          if (!html.includes('target.js')) {
            html = html.replace('</head>', `<script src="//localhost:4001/target.js"></script>${spyScript}</head>`);
          } else {
            html = html.replace('</head>', `${spyScript}</head>`);
          }
          return reply.send(html);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        return reply.send(buffer);
      } catch (err: any) {
        return reply.status(502).send({
          ok: false,
          error: `Failed to proxy to sandbox port ${port}: ${err.message}`,
        });
      }
    },
  );

  /**
   * Universal Web Unblocker Proxy: strips X-Frame-Options and Content-Security-Policy
   * so external websites (like google.com or docs) can be embedded into the preview iframe.
   */
  app.get<{ Querystring: { url: string } }>('/api/proxy/browse', async (req, reply) => {
    let target = req.query.url;
    if (!target) return reply.status(400).send({ ok: false, error: 'Missing url query param' });
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    // Upgrade insecure external http to https
    if (target.startsWith('http://') && !target.includes('localhost') && !target.includes('127.0.0.1')) {
      target = target.replace('http://', 'https://');
    }

    try {
      const fetchFn = options.fetch ?? fetch;
      const res = await fetchFn(target, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      const contentType = res.headers.get('content-type') || 'text/html';
      reply.type(contentType);
      reply.header('x-frame-options', 'ALLOWALL');

      if (contentType.includes('text/html')) {
        let html = await res.text();
        const origin = new URL(target).origin;
        const spyScript = `<script>
(function(){
  try {
    var of = window.fetch;
    if (of) {
      window.fetch = async function(...args) {
        var t0 = performance.now();
        var u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        try {
          var resp = await of.apply(this, args);
          var dur = Math.round(performance.now() - t0);
          window.parent.postMessage({ type: 'ORION_NETWORK_EVENT', request: { url: u, status: resp.status, time: dur } }, '*');
          return resp;
        } catch(e) {
          var dur = Math.round(performance.now() - t0);
          window.parent.postMessage({ type: 'ORION_NETWORK_EVENT', request: { url: u, status: 502, time: dur } }, '*');
          throw e;
        }
      };
    }
  } catch(e){}
})();
</script>`;
        if (!html.includes('<base')) {
          html = html.replace('<head>', `<head><base href="${origin}/"><script src="//localhost:4001/target.js"></script>${spyScript}`);
        } else {
          html = html.replace('<head>', `<head><script src="//localhost:4001/target.js"></script>${spyScript}`);
        }
        return reply.send(html);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      return reply.send(buffer);
    } catch (err: any) {
      // Return a clean in-frame fallback page instead of raw JSON
      const fallbackHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Proxy Notice - ${target}</title>
  <script>
    try {
      window.parent.postMessage({
        type: 'ORION_NETWORK_EVENT',
        request: { url: '${target}', status: 502, time: 64 }
      }, '*');
    } catch(e) {}
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #202124; color: #e8eaed; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
    .card { background: #292a2d; border: 1px border #3c4043; border-radius: 12px; padding: 32px; max-width: 440px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    h2 { font-size: 18px; margin: 0 0 10px; color: #fff; }
    p { font-size: 13px; color: #9aa0a6; line-height: 1.5; margin: 0 0 20px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; background: #8ab4f8; color: #202124; font-weight: 600; font-size: 13px; padding: 8px 18px; border-radius: 6px; text-decoration: none; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .sub { font-size: 11px; color: #5f6368; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>External Site Preview</h2>
    <p>Target site: <strong>${target}</strong><br/>Due to browser CORS / strict origin policies, external services should be opened in a dedicated browser window.</p>
    <a href="${target}" target="_blank" rel="noopener noreferrer" class="btn">Open ${target} in New Tab ↗</a>
    <div class="sub">Preview Tab is optimized for your local web application on :3000</div>
  </div>
</body>
</html>`;
      return reply.type('text/html').send(fallbackHtml);
    }
  });

  /**
   * DevTools helper: returns active Chii targets and inspect URLs
   */
  app.get('/api/devtools/targets', async (_req, reply) => {
    try {
      const fetchFn = options.fetch ?? fetch;
      const res = await fetchFn('http://127.0.0.1:4001/targets');
      if (!res.ok) {
        return reply.send({ ok: false, targets: [] });
      }
      const data = (await res.json()) as { targets?: unknown[] };
      return reply.send({ ok: true, targets: data?.targets ?? [] });
    } catch {
      return reply.send({ ok: false, targets: [] });
    }
  });

  /**
   * Create new agent task
   */
  app.post<{ Body: { instruction: string; repo?: string; sessionId?: string } }>(
    '/tasks',
    {
      schema: {
        body: {
          type: 'object',
          required: ['instruction'],
          properties: {
            instruction: { type: 'string', minLength: 1 },
            repo: { type: 'string' },
            sessionId: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { instruction, repo, sessionId } = req.body;
      const id = `task-${Date.now()}`;

      let session = sessionId ? sessionManager.getSession(sessionId) : undefined;
      if (sessionId && !session) {
        session = await sessionManager.getOrCreateSession(sessionId, repo);
      }

      const record: TaskRecord = {
        id,
        instruction,
        sessionId,
        sandboxUrl: session?.sandbox.url,
        repo: repo ?? session?.repo ?? 'Kunall04/agent-checkout-gate',
        status: 'running',
        events: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(id, record);

      if (autoExecute) {
        // Run agent in background and stream events
        executeTask({
          id,
          instruction,
          repo: record.repo,
          sandboxUrl: session?.sandbox.url,
          sandboxClient: session?.client,
          onEvent: (event) => {
            record.events.push(event);
            record.updatedAt = Date.now();
            const listeners = eventListeners.get(id);
            if (listeners) {
              for (const l of listeners) {
                try {
                  l(event);
                } catch {}
              }
            }
          },
        })
          .then((result) => {
            record.status = 'completed';
            record.result = result;
            record.updatedAt = Date.now();
            const listeners = eventListeners.get(id);
            if (listeners) {
              for (const l of listeners) {
                try {
                  l({ type: 'message', content: result });
                } catch {}
              }
            }
          })
          .catch((err) => {
            record.status = 'failed';
            record.result = err instanceof Error ? err.message : String(err);
            record.updatedAt = Date.now();
          });
      }

      return {
        ok: true,
        got: instruction,
        id,
        task: record,
      };
    },
  );

  /**
   * GitHub App installation callback.
   * GitHub redirects the user here after they install the App on their repositories.
   */
  app.get<{ Querystring: { installation_id: string; setup_action?: string } }>(
    '/api/github/callback',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['installation_id'],
          properties: {
            installation_id: { type: 'string', minLength: 1 },
            setup_action: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { installation_id, setup_action } = req.query;
      const record: InstallationRecord = {
        installationId: installation_id,
        createdAt: Date.now(),
        setupAction: setup_action,
      };
      installations.set(installation_id, record);
      return {
        ok: true,
        installationId: installation_id,
        message: 'GitHub App installed successfully',
      };
    },
  );

  /**
   * List all stored GitHub App installations.
   */
  app.get('/api/github/installations', async () => {
    return {
      ok: true,
      installations: Array.from(installations.values()),
    };
  });

  /**
   * List repositories accessible to a specific GitHub App installation.
   */
  app.get<{ Params: { id: string } }>(
    '/api/github/installations/:id/repos',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const appId = options.githubAppId ?? process.env.GITHUB_APP_ID;
      const privateKey = options.githubPrivateKey ?? loadGitHubPrivateKey();

      if (!appId || !privateKey) {
        return reply.status(500).send({
          ok: false,
          error:
            'GitHub App credentials (GITHUB_APP_ID / GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH) not configured',
        });
      }

      try {
        const jwt = createAppJwt(appId, privateKey);
        const tokenRes = await mintInstallationToken(id, jwt, {
          fetch: options.fetch,
          baseUrl: options.githubBaseUrl,
        });

        const repos = await listInstallationRepos(tokenRes.token, {
          fetch: options.fetch,
          baseUrl: options.githubBaseUrl,
        });

        return {
          ok: true,
          installationId: id,
          repositories: repos,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({
          ok: false,
          error: message,
        });
      }
    },
  );

  return app;
}
