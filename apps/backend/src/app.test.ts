import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';

describe('backend', () => {
  it('GET /health reports ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      service: 'backend',
      status: 'running',
    });
  });

  it('GET /ping reports true', async () => {
    const app = buildApp();
    const resp = await app.inject({ method: 'GET', url: '/ping' });

    expect(resp.statusCode).toBe(200);
    expect(resp.json()).toEqual({ pong: true });
  });

  it('POST /tasks accepts a valid body', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { instruction: 'fix typo' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, got: 'fix typo' });
    expect(res.json().id).toBeDefined();
    expect(res.json().task).toBeDefined();
  });

  it('POST /tasks rejects an empty body', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/tasks', payload: {} });

    expect(res.statusCode).toBe(400);
  });

  describe('GitHub App routes', () => {
    it('GET /api/github/callback stores the installation_id and returns success', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/github/callback?installation_id=987654&setup_action=install',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        ok: true,
        installationId: '987654',
        message: 'GitHub App installed successfully',
      });

      // Verify it shows up in /api/github/installations
      const listRes = await app.inject({ method: 'GET', url: '/api/github/installations' });
      expect(listRes.statusCode).toBe(200);
      const data = listRes.json();
      expect(data.ok).toBe(true);
      expect(data.installations).toHaveLength(1);
      expect(data.installations[0].installationId).toBe('987654');
      expect(data.installations[0].setupAction).toBe('install');
    });

    it('GET /api/github/callback rejects missing installation_id with 400', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/github/callback',
      });

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/github/installations/:id/repos returns 500 when credentials are not configured', async () => {
      const origAppId = process.env.GITHUB_APP_ID;
      const origKeyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_PRIVATE_KEY_PATH;

      try {
        const app = buildApp({ githubAppId: '' });

        const res = await app.inject({
          method: 'GET',
          url: '/api/github/installations/987654/repos',
        });

        expect(res.statusCode).toBe(500);
        expect(res.json().error).toContain('GitHub App credentials');
      } finally {
        if (origAppId) process.env.GITHUB_APP_ID = origAppId;
        if (origKeyPath) process.env.GITHUB_PRIVATE_KEY_PATH = origKeyPath;
      }
    });

    it('GET /api/github/installations/:id/repos mints token and lists repositories', async () => {
      const crypto = await import('node:crypto');
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const mockFetch: typeof fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/access_tokens')) {
          return new Response(
            JSON.stringify({
              token: 'ghs_mockToken123',
              expires_at: '2026-10-17T22:00:00Z',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (urlStr.includes('/installation/repositories')) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  id: 42,
                  name: 'portfolio-site',
                  full_name: 'testdev/portfolio-site',
                  private: false,
                  html_url: 'https://github.com/testdev/portfolio-site',
                  clone_url: 'https://github.com/testdev/portfolio-site.git',
                  default_branch: 'main',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const app = buildApp({
        githubAppId: '123456',
        githubPrivateKey: privateKey,
        fetch: mockFetch,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/github/installations/987654/repos',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.installationId).toBe('987654');
      expect(data.repositories).toHaveLength(1);
      expect(data.repositories[0].name).toBe('portfolio-site');
      expect(data.repositories[0].fullName).toBe('testdev/portfolio-site');
    });

    it('GET /api/github/installations/:id/repos returns 502 when GitHub returns an error', async () => {
      const crypto = await import('node:crypto');
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ message: 'Installation not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const app = buildApp({
        githubAppId: '123456',
        githubPrivateKey: privateKey,
        fetch: mockFetch,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/github/installations/unknown-id/repos',
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().ok).toBe(false);
      expect(res.json().error).toContain('Failed to mint installation token (HTTP 404)');
    });
  });

  describe('Session and multi-sandbox routes', () => {
    it('creates, retrieves, and terminates sessions with isolated sandboxes', async () => {
      const app = buildApp({ autoExecuteTasks: false });

      // Create session
      const createRes = await app.inject({
        method: 'POST',
        url: '/sessions',
        payload: { id: 'chat-test-1', repo: 'owner/test-repo' },
      });
      expect(createRes.statusCode).toBe(200);
      const createData = createRes.json();
      expect(createData.ok).toBe(true);
      expect(createData.session.id).toBe('chat-test-1');
      expect(createData.session.sandbox.port).toBeDefined();

      // List sessions
      const listRes = await app.inject({ method: 'GET', url: '/sessions' });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().sessions).toHaveLength(1);

      // Get single session
      const getRes = await app.inject({ method: 'GET', url: '/sessions/chat-test-1' });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().session.id).toBe('chat-test-1');

      // Create task associated with session
      const taskRes = await app.inject({
        method: 'POST',
        url: '/tasks',
        payload: { instruction: 'run test', sessionId: 'chat-test-1' },
      });
      expect(taskRes.statusCode).toBe(200);
      expect(taskRes.json().task.sessionId).toBe('chat-test-1');
      expect(taskRes.json().task.sandboxUrl).toBe(createData.session.sandbox.url);

      // Terminate session
      const delRes = await app.inject({ method: 'DELETE', url: '/sessions/chat-test-1' });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().terminated).toBe(true);

      // Verify session is gone
      const getAfterDel = await app.inject({ method: 'GET', url: '/sessions/chat-test-1' });
      expect(getAfterDel.statusCode).toBe(404);
    });

    it('returns 404 when getting or deleting non-existent session', async () => {
      const app = buildApp({ autoExecuteTasks: false });

      const getRes = await app.inject({ method: 'GET', url: '/sessions/ghost' });
      expect(getRes.statusCode).toBe(404);

      const delRes = await app.inject({ method: 'DELETE', url: '/sessions/ghost' });
      expect(delRes.statusCode).toBe(404);
    });

    it('persists sessions and messages through Prisma database client', async () => {
      const mockPrisma = {
        session: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'prisma-sess-1',
              title: 'Prisma Saved Session',
              repo: 'org/repo',
              createdAt: new Date('2026-10-31T12:00:00Z'),
              updatedAt: new Date('2026-10-31T12:00:00Z'),
              messages: [{ id: 'm1', sessionId: 'prisma-sess-1', role: 'user', content: 'hello from prisma', createdAt: new Date() }],
            },
          ]),
          upsert: vi.fn().mockResolvedValue({ id: 'prisma-sess-1' }),
          findUnique: vi.fn().mockResolvedValue(null),
          delete: vi.fn().mockResolvedValue({ id: 'prisma-sess-1' }),
        },
        message: {
          create: vi.fn().mockResolvedValue({ id: 'm2' }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const app = buildApp({ autoExecuteTasks: false, prisma: mockPrisma });

      // Create session
      const createRes = await app.inject({
        method: 'POST',
        url: '/sessions',
        payload: { id: 'prisma-sess-1', title: 'Prisma Saved Session' },
      });
      expect(createRes.statusCode).toBe(200);
      expect(mockPrisma.session.upsert).toHaveBeenCalled();

      // Save message
      const msgRes = await app.inject({
        method: 'POST',
        url: '/sessions/prisma-sess-1/messages',
        payload: { message: { role: 'user', content: 'hello' } },
      });
      expect(msgRes.statusCode).toBe(200);
      expect(mockPrisma.message.create).toHaveBeenCalled();

      // List sessions with messages
      const listRes = await app.inject({ method: 'GET', url: '/sessions' });
      expect(listRes.statusCode).toBe(200);
      expect(mockPrisma.session.findMany).toHaveBeenCalled();
      const sessions = listRes.json().sessions;
      expect(sessions.some((s: any) => s.id === 'prisma-sess-1')).toBe(true);

      // Delete session
      const delRes = await app.inject({ method: 'DELETE', url: '/sessions/prisma-sess-1' });
      expect(delRes.statusCode).toBe(200);
      expect(mockPrisma.session.delete).toHaveBeenCalled();
    });
  });

  describe('Live Preview routes', () => {
    it('returns 404 for preview status on unknown session', async () => {
      const app = buildApp({ autoExecuteTasks: false });
      const res = await app.inject({ method: 'GET', url: '/preview/unknown-session/status' });
      expect(res.statusCode).toBe(404);
      expect(res.json().ok).toBe(false);
    });

    it('checks preview status on active session with custom fetch probe', async () => {
      const mockFetch: typeof fetch = async (input, init) => {
        return new Response(null, { status: 200 });
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });
      await app.inject({
        method: 'POST',
        url: '/sessions',
        payload: { id: 'preview-session-1' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/preview/preview-session-1/status?port=3000',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.sessionId).toBe('preview-session-1');
      expect(data.port).toBe(3000);
      expect(data.running).toBe(true);
      expect(data.sandbox.port).toBeDefined();
    });

    it('auto-detects active development server port when requested port is not running', async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes(':5177/')) {
          return new Response(null, { status: 200 });
        }
        throw new Error('Connection refused');
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });
      await app.inject({
        method: 'POST',
        url: '/sessions',
        payload: { id: 'preview-session-autoport' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/preview/preview-session-autoport/status?port=3000',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.port).toBe(5177);
      expect(data.running).toBe(true);
    });

    it('proxies preview requests to the sandbox application port', async () => {
      let capturedUrl = '';
      const mockFetch: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        return new Response('<html><body>Live App Test</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });
      await app.inject({
        method: 'POST',
        url: '/sessions',
        payload: { id: 'preview-session-2' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/preview/preview-session-2/3000/dashboard/users?sort=asc',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
      expect(res.body).toContain('Live App Test');
      expect(capturedUrl).toBe('http://127.0.0.1:3000/dashboard/users?sort=asc');
    });
  });

  describe('Terminal and Workspace Files API', () => {
    it('POST /api/terminal runs a command against the session sandbox client', async () => {
      const mockFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes('/command')) {
          return new Response(JSON.stringify({ output: 'node v20.14.0\n' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });
      const res = await app.inject({
        method: 'POST',
        url: '/api/terminal',
        payload: { command: 'node -v', sessionId: 'term-sess-1' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.output).toContain('v20.14.0');
    });

    it('POST /api/terminal backgrounds dev server commands', async () => {
      const mockFetch: typeof fetch = async (input, init) => {
        return new Response(JSON.stringify({ output: '' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });
      const res = await app.inject({
        method: 'POST',
        url: '/api/terminal',
        payload: { command: 'npm run dev', sessionId: 'term-sess-2' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.output).toContain('Started dev server in background');
      expect(data.output).toContain('port 3000');
    });

    it('POST /api/terminal returns ENOENT error when npm run dev is run without package.json', async () => {
      const mockFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes('/read')) {
          return new Response('File not found', { status: 404 });
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });
      const res = await app.inject({
        method: 'POST',
        url: '/api/terminal',
        payload: { command: 'npm run dev', sessionId: 'empty-term-sess' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.output).toContain('npm error code ENOENT');
      expect(data.output).toContain('Could not read package.json');
    });

    it('GET /sessions/:id/files lists project workspace files', async () => {
      const mockFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes('/command')) {
          return new Response(JSON.stringify({ output: './package.json\n./src/index.ts\n./README.md\n' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });
      const res = await app.inject({
        method: 'GET',
        url: '/sessions/files-sess-1/files',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.files).toEqual(['package.json', 'src/index.ts', 'README.md']);
    });

    it('GET and POST /sessions/:id/file reads and writes workspace files', async () => {
      let savedContent = '';
      const mockFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes('/read')) {
          return new Response(JSON.stringify({ output: 'console.log("hello world");' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/write')) {
          const body = JSON.parse(String(init?.body || '{}'));
          savedContent = body.content;
          return new Response(JSON.stringify({ output: 'Wrote 30 bytes to file.' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      };

      const app = buildApp({ autoExecuteTasks: false, fetch: mockFetch });

      // Read file
      const readRes = await app.inject({
        method: 'GET',
        url: '/sessions/file-sess-2/file?path=src/index.ts',
      });
      expect(readRes.statusCode).toBe(200);
      expect(readRes.json().content).toBe('console.log("hello world");');

      // Write file
      const writeRes = await app.inject({
        method: 'POST',
        url: '/sessions/file-sess-2/file',
        payload: { path: 'src/index.ts', content: 'console.log("updated");' },
      });
      expect(writeRes.statusCode).toBe(200);
      expect(savedContent).toBe('console.log("updated");');
    });
  });
});
