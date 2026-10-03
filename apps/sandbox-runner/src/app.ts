import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Sandbox app factory. In Phase 2 this grows the real API:
 *   POST /shell                -> create a PTY shell
 *   POST /shell/:id/command    -> run a command
 *   GET  /shell/:id/output     -> stream output
 *   file ops: read/write/update/delete/undo
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    return { ok: true, service: 'sandbox-runner' };
  });

  return app;
}
