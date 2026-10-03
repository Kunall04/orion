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
  expect(res.json()).toEqual({ ok: true, got: 'fix typo' });
});

it('POST /tasks rejects an empty body', async () => {
  const app = buildApp();
  const res = await app.inject({ method: 'POST', url: '/tasks', payload: {} });

  expect(res.statusCode).toBe(400);
});


});
