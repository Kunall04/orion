import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_OUTPUT, runCommand } from './shell';

async function opts(timeoutMs?: number) {
  const dir = await mkdtemp(join(tmpdir(), 'orion-shell-'));
  return { cwd: dir, outDir: join(dir, 'out'), timeoutMs };
}

describe('runCommand', () => {
  it('returns output of a successful command, with no exit-code note', async () => {
    expect(await runCommand('echo hello', await opts())).toBe('hello\n');
  });

  it('reports the exit code when a command fails silently', async () => {
    expect(await runCommand('exit 3', await opts())).toContain('[exit code 3]');
  });

  it('captures stderr too', async () => {
    const out = await runCommand('echo oops 1>&2; exit 1', await opts());
    expect(out).toContain('oops');
    expect(out).toContain('[exit code 1]');
  });

  it('stops a command that never finishes', async () => {
    const out = await runCommand('sleep 5', await opts(200));
    expect(out).toContain('did not finish');
  });

  it('explains when the stuck command looks like a dev server', async () => {
    const out = await runCommand('sleep 5 # npm run dev', await opts(200));
    expect(out).toContain('server or watcher');
  });

  it('does not hang on a command that waits for input', async () => {
    const out = await runCommand('cat', await opts(2000));
    expect(out).not.toContain('did not finish');
  });

  it('cuts long output and saves the full text to a file', async () => {
    const o = await opts();
    const out = await runCommand('seq 1 5000', o);
    expect(out.length).toBeLessThan(MAX_OUTPUT + 400);
    const file = /Full output at (\S+)\./.exec(out)?.[1];
    expect(file).toBeTruthy();
    const saved = await readFile(file!, 'utf8');
    expect(saved.endsWith('5000\n')).toBe(true);
  });
});
