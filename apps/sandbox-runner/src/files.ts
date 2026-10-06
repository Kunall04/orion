import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

/**
 * Replace exact text in a file. By default the text must match exactly once,
 * so the agent can't silently change the wrong line. Returns text for the LLM, never throws.
 */
export async function replaceInFile(
  path: string,
  oldStr: string,
  newStr: string,
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
