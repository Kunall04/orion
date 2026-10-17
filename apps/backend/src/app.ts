import Fastify, { type FastifyInstance } from 'fastify';
import type { TaskStatus } from '@cloud-agent/shared';

export interface InstallationRecord {
  installationId: string;
  createdAt: number;
  setupAction?: string;
}

export interface BackendAppOptions {
  /** Optional store for installations (defaults to in-memory Map) */
  installations?: Map<string, InstallationRecord>;
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

  return app;
}
