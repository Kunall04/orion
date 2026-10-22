import Fastify, { type FastifyInstance } from 'fastify';
import type { TaskStatus } from '@cloud-agent/shared';
import { createAppJwt, loadGitHubPrivateKey, mintInstallationToken } from './github/auth';
import { listInstallationRepos } from './github/repos';
import { executeTask } from './agent/task-runner';
import type { AgentEvent } from './agent/loop';
import { SessionManager } from './session/manager';

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
  const sessionManager = options.sessionManager ?? new SessionManager();
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
