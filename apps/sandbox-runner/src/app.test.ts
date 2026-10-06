import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  it('POST /replace edits a file inside the project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orion-app-'));
    await writeFile(join(dir, 'a.js'), 'const port = 3000;\n');
    const app = buildApp({ workDir: dir, outDir: join(dir, 'out') });

    const res = await app.inject({
      method: 'POST',
      url: '/replace',
      payload: { path: 'a.js', old_str: '3000', new_str: '4000' },
    });

    expect(res.json().output).toContain('Replaced 1');
    expect(await readFile(join(dir, 'a.js'), 'utf8')).toBe('const port = 4000;\n');
  });

  it('POST /replace refuses a path outside the project', async () => {
    const app = await appInTempDir();
    const res = await app.inject({
      method: 'POST',
      url: '/replace',
      payload: { path: '../../../etc/hosts', old_str: 'a', new_str: 'b' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().output).toContain('inside the project folder');
  });

  it('POST /replace rejects a body with a missing field', async () => {
    const app = await appInTempDir();
    const res = await app.inject({ method: 'POST', url: '/replace', payload: { path: 'a.js' } });

    expect(res.statusCode).toBe(400);
  });
  it('POST /read returns a slice of a file inside the project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orion-app-'));
    await writeFile(join(dir, 'a.txt'), 'one\ntwo\nthree\n');
    const app = buildApp({ workDir: dir, outDir: join(dir, 'out') });

    const res = await app.inject({
      method: 'POST',
      url: '/read',
      payload: { path: 'a.txt', offset: 2, limit: 1 },
    });

    expect(res.json().output).toContain('two');
    expect(res.json().output).not.toContain('three\n');
  });

  it('POST /read refuses a path outside the project', async () => {
    const app = await appInTempDir();
    const res = await app.inject({ method: 'POST', url: '/read', payload: { path: '/etc/hosts' } });

    expect(res.json().output).toContain('inside the project folder');
  });

  it('POST /read rejects a bad offset with 400', async () => {
    const app = await appInTempDir();
    const res = await app.inject({
      method: 'POST',
      url: '/read',
      payload: { path: 'a', offset: 0 },
    });

    expect(res.statusCode).toBe(400);
  });
});
