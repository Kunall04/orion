import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { History } from './history';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'orion-hist-'));
  return { dir, file: join(dir, 'a.txt'), history: new History(join(dir, 'history')) };
}

describe('History', () => {
  it('restores the previous contents of a changed file', async () => {
    const { file, history } = await setup();
    await writeFile(file, 'old');
    await history.snapshot(file);
    await writeFile(file, 'new');

    expect(await history.undo()).toContain('restored');
    expect(await readFile(file, 'utf8')).toBe('old');
  });

  it('deletes a file that did not exist before the change', async () => {
    const { file, history } = await setup();
    await history.snapshot(file);
    await writeFile(file, 'created');

    expect(await history.undo()).toContain('deleted');
    await expect(stat(file)).rejects.toThrow();
  });

  it('undoes changes newest first, one step at a time', async () => {
    const { file, history } = await setup();
    await writeFile(file, 'v1');
    await history.snapshot(file);
    await writeFile(file, 'v2');
    await history.snapshot(file);
    await writeFile(file, 'v3');

    await history.undo();
    expect(await readFile(file, 'utf8')).toBe('v2');
    await history.undo();
    expect(await readFile(file, 'utf8')).toBe('v1');
  });

  it('says so when there is nothing to undo', async () => {
    const { history } = await setup();
    expect(await history.undo()).toBe('Nothing to undo.');
  });
});
