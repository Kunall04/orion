import Fastify, { type FastifyInstance } from 'fastify';
import type { TaskStatus } from '@cloud-agent/shared';

/**
 * App factory — no port binding here, so tests can build the app in-memory
 * and hit routes with `inject()` instead of opening a socket.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    const status: TaskStatus = 'running';
    return { ok: true, service: 'backend', status };
  });

  app.get('/ping', async () => {
    return { pong: true };
  });

  app.post<{ Body : { instruction: string }}>( '/tasks', {
    schema: {
      body: {
        type: 'object',
        required: ['instruction'],
        properties: { instruction: { type: 'string', minLength: 1 } },
      },
    },
  }, async(req)=>{
      const { instruction } = req.body;
      return { ok: true, got: instruction };
  });

  return app;
}
