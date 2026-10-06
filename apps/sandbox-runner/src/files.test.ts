import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { History } from './history';
import { MAX_OUTPUT } from './shell';
import { readFileSlice, replaceInFile, resolveInside } from './files';

async function fileWith(content: string) {
  const path = join(await mkdtemp(join(tmpdir(), 'orion-files-')), 'a.js');
  await writeFile(path, content);
  return path;
}

const newHistory = async () => new History(join(await mkdtemp(join(tmpdir(), 'orion-h-')), 'h'));

describe('replaceInFile', () => {
  it('replaces text that matches exactly once', async () => {
    const p = await fileWith('const port = 3000;\nconsole.log(port);\n');
    expect(await replaceInFile(p, '3000', '4000', await newHistory())).toContain('Replaced 1');
    expect(await readFile(p, 'utf8')).toBe('const port = 4000;\nconsole.log(port);\n');
  });

  it('refuses when the text matches more than once, and leaves the file alone', async () => {
    const original = 'const port = 3000;\nconst port = 3000;\n';
    const p = await fileWith(original);
    expect(await replaceInFile(p, 'const port = 3000;', 'x', await newHistory())).toContain(
      'matches 2 times',
    );
    expect(await readFile(p, 'utf8')).toBe(original);
  });

  it('replaces all matches only when allowed', async () => {
    const p = await fileWith('a a a');
    expect(await replaceInFile(p, 'a', 'b', await newHistory(), true)).toContain('Replaced 3');
    expect(await readFile(p, 'utf8')).toBe('b b b');
  });

  it('reports text that is not found', async () => {
    const p = await fileWith('hello');
    expect(await replaceInFile(p, 'nope', 'x', await newHistory())).toContain('not found');
  });

  it('reports a missing file', async () => {
    expect(await replaceInFile('/nonexistent/file.txt', 'a', 'b', await newHistory())).toContain(
      'does not exist',
    );
  });

  it('saves the old contents so the edit can be undone', async () => {
    const p = await fileWith('const port = 3000;\n');
    const history = await newHistory();
    await replaceInFile(p, '3000', '4000', history);

    expect(await history.undo()).toContain('restored');
    expect(await readFile(p, 'utf8')).toBe('const port = 3000;\n');
  });

  it('leaves no undo entry when the edit is refused', async () => {
    const p = await fileWith('a a');
    const history = await newHistory();
    await replaceInFile(p, 'a', 'b', history); // matches twice, refused

    expect(await history.undo()).toBe('Nothing to undo.');
  });
});

describe('resolveInside', () => {
  it('accepts paths inside the project', () => {
    expect(resolveInside('/proj', 'src/a.js')).toBe('/proj/src/a.js');
    expect(resolveInside('/proj', '/proj/src/a.js')).toBe('/proj/src/a.js');
  });

  it('rejects paths that escape the project', () => {
    expect(resolveInside('/proj', '../etc/hosts')).toBeNull();
    expect(resolveInside('/proj', 'src/../../etc/hosts')).toBeNull();
    expect(resolveInside('/proj', '/etc/hosts')).toBeNull();
    expect(resolveInside('/proj', '.')).toBeNull();
  });
});

describe('readFileSlice', () => {
  const numbered = (n: number) =>
    Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

  it('returns a small file whole, with no note', async () => {
    const p = await fileWith('a\nb\n');
    expect(await readFileSlice(p)).toBe('a\nb');
  });

  it('returns only the requested slice and says how to continue', async () => {
    const p = await fileWith(numbered(10));
    const out = await readFileSlice(p, 3, 2);
    expect(out).toContain('line 3\nline 4');
    expect(out).not.toContain('line 5');
    expect(out).toContain('showing lines 3-4 of 10');
    expect(out).toContain('offset=5');
  });

  it('gives no note when the slice reaches the end', async () => {
    const p = await fileWith(numbered(5));
    expect(await readFileSlice(p, 4, 10)).toBe('line 4\nline 5');
  });

  it('reports an offset past the end', async () => {
    const p = await fileWith(numbered(3));
    expect(await readFileSlice(p, 99)).toContain('past the end');
  });

  it('caps one gigantic line', async () => {
    const p = await fileWith('x'.repeat(MAX_OUTPUT * 3));
    const out = await readFileSlice(p);
    expect(out.length).toBeLessThan(MAX_OUTPUT + 200);
    expect(out).toContain('showing lines');
  });

  it('handles an empty file and a missing file', async () => {
    expect(await readFileSlice(await fileWith(''))).toBe('(empty file)');
    expect(await readFileSlice('/nonexistent/x.txt')).toContain('does not exist');
  });
});
