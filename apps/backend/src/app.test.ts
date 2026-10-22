import { describe, expect, it } from 'vitest';
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
      const app = buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/github/installations/987654/repos',
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toContain('GitHub App credentials');
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
  });
});
