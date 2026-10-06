import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { History } from './history';
import { MAX_OUTPUT } from './shell';

/**
 * Replace exact text in a file. By default the text must match exactly once,
 * so the agent can't silently change the wrong line. Returns text for the LLM, never throws.
 */
export async function replaceInFile(
  path: string,
  oldStr: string,
  newStr: string,
  history: History,
  allowMulti = false,
): Promise<string> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch {
    return `Error: ${path} does not exist or is not a readable file.`;
  }

  const count = content.split(oldStr).length - 1;
  if (oldStr === '' || count === 0) return `Error: old_str was not found in ${path}.`;
  if (count > 1 && !allowMulti) {
    return (
      `Error: old_str matches ${count} times in ${path}. ` +
      'Add surrounding lines to make it unique, or set allow_multi to replace all.'
    );
  }

  // Only now do we know a change will happen, so only now do we save the old contents.
  await history.snapshot(path);
  await writeFile(path, content.split(oldStr).join(newStr));
  return `Replaced ${count} match(es) in ${path}.`;
}

/**
 * Turn the agent's path into a real path, but only if it stays inside `root`.
 * Returns null for anything that escapes (../, absolute paths elsewhere).
 * ponytail: symlinks inside the project are not followed, the Docker box is the real wall.
 */
export function resolveInside(root: string, requested: string): string | null {
  const full = resolve(root, requested);
  const rel = relative(root, full);
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || resolve(rel) === rel) return null;
  return full;
}

/**
 * Read part of a file: `limit` lines starting at line `offset` (1-based).
 * Big files come back in pieces, with a note saying how to get the next piece.
 * Returns text for the LLM, never throws.
 */
export async function readFileSlice(path: string, offset = 1, limit = 200): Promise<string> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch {
    return `Error: ${path} does not exist or is not a readable file.`;
  }

  if (content === '') return '(empty file)';
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop(); // the last newline is not an extra empty line
  if (offset > lines.length) {
    return `Error: offset ${offset} is past the end of the file (${lines.length} lines).`;
  }

  const end = Math.min(offset - 1 + limit, lines.length);
  let text = lines.slice(offset - 1, end).join('\n');
  let shownEnd = end;
  // A minified file can have one gigantic line, so the line window alone is not enough.
  if (text.length > MAX_OUTPUT) {
    text = text.slice(0, MAX_OUTPUT);
    shownEnd = offset; // only part of the first line(s) fit; ask for a smaller window
  }

  if (shownEnd < lines.length || text.length === MAX_OUTPUT) {
    text += `\n[showing lines ${offset}-${shownEnd} of ${lines.length}. Call again with offset=${shownEnd + 1} to continue.]`;
  }
  return text;
}

/**
 * Create a file, or overwrite it. Parent folders are created as needed.
 * The old contents are saved first so the change can be undone.
 * Returns text for the LLM, never throws.
 */
export async function writeToFile(
  path: string,
  content: string,
  history: History,
): Promise<string> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await history.snapshot(path);
    await writeFile(path, content);
    return `Wrote ${content.length} characters to ${path}.`;
  } catch (err) {
    return `Error: could not write ${path}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
