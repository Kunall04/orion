import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SandboxClient } from './client';

describe('SandboxClient', () => {
  let mockServer: FastifyInstance;
  let client: SandboxClient;

  beforeAll(async () => {
    mockServer = Fastify({ logger: false });

    // Mock health route
    mockServer.get('/health', async () => ({ ok: true, service: 'sandbox-runner' }));

    // Mock command route
    mockServer.post<{ Body: { command: string; timeoutMs?: number } }>('/command', async (req) => {
      return { output: `executed: ${req.body.command}` };
    });

    // Mock read route
    mockServer.post<{ Body: { path: string; offset?: number; limit?: number } }>(
      '/read',
      async (req) => {
        return { output: `read ${req.body.path} from offset ${req.body.offset ?? 1}` };
      },
    );

    // Mock write route
    mockServer.post<{ Body: { path: string; content: string } }>('/write', async (req) => {
      return { output: `wrote ${req.body.content.length} chars to ${req.body.path}` };
    });

    // Mock replace route
    mockServer.post<{
      Body: { path: string; old_str: string; new_str: string; allow_multi?: boolean };
    }>('/replace', async (req) => {
      return {
        output: `replaced in ${req.body.path}: "${req.body.old_str}" -> "${req.body.new_str}"`,
      };
    });

    // Mock undo route
    mockServer.post('/undo', async () => {
      return { output: 'undid last change' };
    });

    // Error simulation route for testing bad requests
    mockServer.post('/error-400', async (_req, reply) => {
      return reply.status(400).send('Malformed JSON');
    });

    // An in-memory fetch adapter routing through Fastify's inject()
    // This tests the real routes and HTTP serialization without opening raw TCP sockets.
    const customFetch: typeof fetch = async (input, init) => {
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(urlStr);
      const method = (init?.method ?? 'GET') as 'GET' | 'POST';
      const payload = init?.body ? JSON.parse(init.body as string) : undefined;

      const res = await mockServer.inject({
        method,
        url: url.pathname,
        payload,
      });

      return new Response(res.payload, {
        status: res.statusCode,
        headers: res.headers as Record<string, string>,
      });
    };

    client = new SandboxClient({
      baseUrl: 'http://sandbox.local',
      fetch: customFetch,
    });
  });

  afterAll(async () => {
    await mockServer.close();
  });

  it('checkHealth returns true when server is up', async () => {
    const isHealthy = await client.checkHealth();
    expect(isHealthy).toBe(true);
  });

  it('checkHealth returns false when server is down or throws', async () => {
    const deadClient = new SandboxClient({
      baseUrl: 'http://dead.local',
      fetch: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    const isHealthy = await deadClient.checkHealth();
    expect(isHealthy).toBe(false);
  });

  it('runCommand sends POST /command and returns output', async () => {
    const out = await client.runCommand('ls -la', 5000);
    expect(out).toBe('executed: ls -la');
  });

  it('readFile sends POST /read and returns output', async () => {
    const out = await client.readFile('package.json', 1, 10);
    expect(out).toBe('read package.json from offset 1');
  });

  it('writeFile sends POST /write and returns output', async () => {
    const out = await client.writeFile('README.md', '# Hello');
    expect(out).toBe('wrote 7 chars to README.md');
  });

  it('updateFile sends POST /replace and returns output', async () => {
    const out = await client.updateFile('index.ts', 'const a = 1', 'const a = 2');
    expect(out).toBe('replaced in index.ts: "const a = 1" -> "const a = 2"');
  });

  it('undo sends POST /undo and returns output', async () => {
    const out = await client.undo();
    expect(out).toBe('undid last change');
  });

  it('handles server errors gracefully without throwing', async () => {
    const errorClient = new SandboxClient({
      baseUrl: 'http://sandbox.local/error-400',
      fetch: async () => new Response('Malformed JSON', { status: 400 }),
    });
    const res = await errorClient.undo();
    expect(res).toContain('Error: Sandbox responded with status 400');
  });

  it('handles connection failures gracefully without throwing', async () => {
    const deadClient = new SandboxClient({
      baseUrl: 'http://dead.local',
      fetch: async () => {
        throw new Error('fetch failed');
      },
    });
    const res = await deadClient.runCommand('ls');
    expect(res).toContain('Error connecting to sandbox: fetch failed');
  });

  it('readFile with local workDir fallback returns raw content without line number prefixes', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'sandbox-client-test-'));
    try {
      writeFileSync(join(tmpDir, 'test.txt'), 'line one\nline two\nline three');
      const fallbackClient = new SandboxClient({
        baseUrl: 'http://dead.local',
        workDir: tmpDir,
        fetch: async () => {
          throw new Error('fetch failed');
        },
      });
      const content = await fallbackClient.readFile('test.txt');
      expect(content).toBe('line one\nline two\nline three');
      expect(content).not.toMatch(/^\d+:/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
