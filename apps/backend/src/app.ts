import Fastify, { type FastifyInstance } from 'fastify';
import type { TaskStatus } from '@cloud-agent/shared';
import { createAppJwt, loadGitHubPrivateKey, mintInstallationToken } from './github/auth';
import { listInstallationRepos } from './github/repos';

export interface InstallationRecord {
  installationId: string;
  createdAt: number;
  setupAction?: string;
}

export interface BackendAppOptions {
  /** Optional store for installations (defaults to in-memory Map) */
  installations?: Map<string, InstallationRecord>;
  /** GitHub App ID */
  githubAppId?: string;
  /** GitHub App Private Key (PEM format) */
  githubPrivateKey?: string;
  /** Custom fetch implementation for testing */
  fetch?: typeof fetch;
  /** GitHub API base URL (defaults to https://api.github.com) */
  githubBaseUrl?: string;
}

/**
 * App factory — no port binding here, so tests can build the app in-memory
 * and hit routes with `inject()` instead of opening a socket.
 */
export function buildApp(options: BackendAppOptions = {}): FastifyInstance {
  const installations = options.installations ?? new Map<string, InstallationRecord>();
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    const status: TaskStatus = 'running';
    return { ok: true, service: 'backend', status };
  });

  app.get('/ping', async () => {
    return { pong: true };
  });

  app.post<{ Body: { instruction: string } }>(
    '/tasks',
    {
      schema: {
        body: {
          type: 'object',
          required: ['instruction'],
          properties: { instruction: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req) => {
      const { instruction } = req.body;
      return { ok: true, got: instruction };
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
