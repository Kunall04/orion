import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { runCommand } from './shell';

export interface SandboxOptions {
  /** Folder commands run in (the project the agent works on). */
  workDir?: string;
  /** Folder where long command output is saved. */
  outDir?: string;
}

/**
 * Sandbox app factory. Routes so far:
 *   GET  /health
 *   POST /command   -> run one shell command, return its output as text
 * Next: file routes (read/write/replace/undo).
 */
export function buildApp(options: SandboxOptions = {}): FastifyInstance {
  const workDir = options.workDir ?? process.cwd();
  const outDir = options.outDir ?? join(tmpdir(), 'orion-sandbox-out');
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    return { ok: true, service: 'sandbox-runner' };
  });

  app.post<{ Body: { command: string; timeoutMs?: number } }>(
    '/command',
    {
      schema: {
        body: {
          type: 'object',
          required: ['command'],
          properties: {
            command: { type: 'string', minLength: 1 },
            timeoutMs: { type: 'number', minimum: 100, maximum: 300_000 },
          },
        },
      },
    },
    async (req) => {
      const { command, timeoutMs } = req.body;
      // HTTP 200 means "the request worked". Whether the command succeeded is in the text.
      const output = await runCommand(command, { cwd: workDir, outDir, timeoutMs });
      return { output };
    },
  );

  return app;
}
