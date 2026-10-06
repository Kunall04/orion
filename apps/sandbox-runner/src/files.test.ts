import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replaceInFile, resolveInside } from './files';

async function fileWith(content: string) {
  const path = join(await mkdtemp(join(tmpdir(), 'orion-files-')), 'a.js');
  await writeFile(path, content);
  return path;
}

describe('replaceInFile', () => {
  it('replaces text that matches exactly once', async () => {
    const p = await fileWith('const port = 3000;\nconsole.log(port);\n');
    expect(await replaceInFile(p, '3000', '4000')).toContain('Replaced 1');
    expect(await readFile(p, 'utf8')).toBe('const port = 4000;\nconsole.log(port);\n');
  });

  it('refuses when the text matches more than once, and leaves the file alone', async () => {
    const original = 'const port = 3000;\nconst port = 3000;\n';
    const p = await fileWith(original);
    expect(await replaceInFile(p, 'const port = 3000;', 'x')).toContain('matches 2 times');
    expect(await readFile(p, 'utf8')).toBe(original);
  });

  it('replaces all matches only when allowed', async () => {
    const p = await fileWith('a a a');
    expect(await replaceInFile(p, 'a', 'b', true)).toContain('Replaced 3');
    expect(await readFile(p, 'utf8')).toBe('b b b');
  });

  it('reports text that is not found', async () => {
    const p = await fileWith('hello');
    expect(await replaceInFile(p, 'nope', 'x')).toContain('not found');
  });

  it('reports a missing file', async () => {
    expect(await replaceInFile('/nonexistent/file.txt', 'a', 'b')).toContain('does not exist');
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
