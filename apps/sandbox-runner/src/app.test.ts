import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

async function appInTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'orion-app-'));
  return buildApp({ workDir: dir, outDir: join(dir, 'out') });
}

describe('sandbox-runner', () => {
  it('GET /health reports ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: 'sandbox-runner' });
  });

  it('POST /command runs a command and returns its output', async () => {
    const app = await appInTempDir();
    const res = await app.inject({
      method: 'POST',
      url: '/command',
      payload: { command: 'echo hi' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ output: 'hi\n' });
  });

  it('POST /command reports a failing command in the text, not as an HTTP error', async () => {
    const app = await appInTempDir();
    const res = await app.inject({
      method: 'POST',
      url: '/command',
      payload: { command: 'exit 4' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().output).toContain('[exit code 4]');
  });

  it('POST /command rejects a missing command with 400', async () => {
    const app = await appInTempDir();
    const res = await app.inject({ method: 'POST', url: '/command', payload: {} });

    expect(res.statusCode).toBe(400);
  });
});
