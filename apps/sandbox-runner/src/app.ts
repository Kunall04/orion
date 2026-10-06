import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { replaceInFile, resolveInside } from './files';
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
 *   POST /replace   -> replace exact text in a file (must match once)
 * Next: read/write/undo.
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

  app.post<{ Body: { path: string; old_str: string; new_str: string; allow_multi?: boolean } }>(
    '/replace',
    {
      schema: {
        body: {
          type: 'object',
          required: ['path', 'old_str', 'new_str'],
          properties: {
            path: { type: 'string', minLength: 1 },
            old_str: { type: 'string', minLength: 1 },
            new_str: { type: 'string' },
            allow_multi: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const { path, old_str, new_str, allow_multi } = req.body;
      const full = resolveInside(workDir, path);
      if (!full) return { output: 'Error: path must be a file inside the project folder.' };
      return { output: await replaceInFile(full, old_str, new_str, allow_multi) };
    },
  );

  return app;
}
