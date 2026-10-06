import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSlice, replaceInFile, resolveInside, writeToFile } from './files';
import { History } from './history';
import { runCommand } from './shell';

export interface SandboxOptions {
  /** Folder commands run in (the project the agent works on). */
  workDir?: string;
  /** Folder where long command output is saved. */
  outDir?: string;
  /** Folder where undo snapshots are saved. */
  historyDir?: string;
}

/**
 * Sandbox app factory. Routes so far:
 *   GET  /health
 *   POST /command   -> run one shell command, return its output as text
 *   POST /replace   -> replace exact text in a file (must match once; undoable)
 *   POST /read      -> read a file, or a slice of it
 *   POST /write     -> create or overwrite a file (old contents saved for undo)
 *   POST /undo      -> undo the most recent write/replace
 * That completes the sandbox API for Phase 2.
 */
export function buildApp(options: SandboxOptions = {}): FastifyInstance {
  const workDir = options.workDir ?? process.cwd();
  const outDir = options.outDir ?? join(tmpdir(), 'orion-sandbox-out');
  const history = new History(options.historyDir ?? join(tmpdir(), 'orion-sandbox-history'));
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
      return { output: await replaceInFile(full, old_str, new_str, history, allow_multi) };
    },
  );

  app.post<{ Body: { path: string; offset?: number; limit?: number } }>(
    '/read',
    {
      schema: {
        body: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1 },
            offset: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 2000 },
          },
        },
      },
    },
    async (req) => {
      const { path, offset, limit } = req.body;
      const full = resolveInside(workDir, path);
      if (!full) return { output: 'Error: path must be a file inside the project folder.' };
      return { output: await readFileSlice(full, offset, limit) };
    },
  );

  app.post<{ Body: { path: string; content: string } }>(
    '/write',
    {
      schema: {
        body: {
          type: 'object',
          required: ['path', 'content'],
          properties: { path: { type: 'string', minLength: 1 }, content: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const { path, content } = req.body;
      const full = resolveInside(workDir, path);
      if (!full) return { output: 'Error: path must be a file inside the project folder.' };
      return { output: await writeToFile(full, content, history) };
    },
  );

  // No body: it always undoes the newest change made through /write or /replace.
  app.post('/undo', async () => ({ output: await history.undo() }));

  return app;
}
