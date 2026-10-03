import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('sandbox-runner', () => {
  it('GET /health reports ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: 'sandbox-runner' });
  });
});
