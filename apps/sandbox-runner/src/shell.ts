import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Output longer than this is cut; the full text is saved to a file the agent can page through. */
export const MAX_OUTPUT = 10_000;

// Words that suggest a command is a server/watcher that never exits on its own.
const NEVER_ENDS = /\b(dev|start|serve|watch|runserver)\b|nodemon/i;

export interface RunOptions {
  cwd: string;
  /** Per-session folder for saved long output (session state lives here, not in a global). */
  outDir: string;
  timeoutMs?: number;
}

/**
 * Run one shell command to completion and return what the LLM should read.
 * Never throws: every failure becomes text, so the agent can react to it.
 * ponytail: output is buffered in memory, add a byte limit if a tool ever prints gigabytes.
 */
export function runCommand(command: string, opts: RunOptions): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return new Promise((resolve) => {
    // stdin closed so a command that asks a question fails fast instead of hanging;
    // CI=1 makes most tools skip their prompts. detached = own process group, so we can kill children too.
    const child = spawn('/bin/sh', ['-c', command], {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
      detached: true,
    });

    let output = '';
    let timedOut = false;
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        // already gone
      }
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve(`Error: could not start command: ${err.message}`);
    });

    child.on('close', async (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve(timeoutMessage(command, timeoutMs));
        return;
      }
      let text = await capOutput(output, opts.outDir);
      // A failing command can print nothing, which looks identical to success. Say so.
      if (code !== 0) text += `\n[exit code ${code}]`;
      resolve(text);
    });
  });
}

function timeoutMessage(command: string, timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  if (NEVER_ENDS.test(command)) {
    return (
      `"${command}" looks like a server or watcher that runs forever, and was stopped after ${seconds}s. ` +
      'This tool can only run commands that finish. Tell the user to run it themselves; do not retry it here.'
    );
  }
  return (
    `"${command}" did not finish within ${seconds}s and was stopped. ` +
    'If it is a long-running process, this tool cannot run it; tell the user instead of retrying.'
  );
}

/** Keep the start of long output, save the whole thing to a file, and say where. */
async function capOutput(text: string, outDir: string): Promise<string> {
  if (text.length <= MAX_OUTPUT) return text;

  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `out-${randomUUID()}.txt`);
  await writeFile(file, text);
  return (
    text.slice(0, MAX_OUTPUT) +
    `\n\n[output trimmed: ${text.length - MAX_OUTPUT} of ${text.length} chars cut. ` +
    `Full output at ${file}. Read pieces with head, tail, sed -n or grep.]`
  );
}
