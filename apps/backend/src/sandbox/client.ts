/**
 * Sandbox Client — the backend's telephone to the sandbox runner.
 *
 * Supports both HTTP mode (Docker/remote container on its own port)
 * and direct local workspace fallback (when container or HTTP runner is offline).
 *
 * Every route returns plain string output so tool results can be fed
 * directly into the LLM conversation loop.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface SandboxClientOptions {
  /** Base URL of the sandbox runner, e.g. "http://127.0.0.1:5001" */
  baseUrl: string;
  /** Optional custom fetch implementation (useful for tests or custom dispatchers) */
  fetch?: typeof fetch;
  /** Optional local workspace directory for direct execution if sandbox HTTP runner is offline */
  workDir?: string;
}

export class SandboxClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly workDir?: string;

  constructor(options: SandboxClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.workDir = options.workDir;
  }

  /**
   * Helper to POST JSON to the sandbox and return the "output" text.
   */
  private async post(path: string, body?: Record<string, unknown>): Promise<string> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        return `Error: Sandbox responded with status ${res.status}: ${text}`;
      }

      const data = (await res.json()) as { output?: string };
      return data.output ?? '';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error connecting to sandbox: ${message}`;
    }
  }

  /** Check if the sandbox server is reachable and responsive. */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/health`);
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean };
        if (data.ok === true) return true;
      }
    } catch {}

    // Fallback: if local workDir exists on the host filesystem, sandbox is ready
    if (this.workDir && existsSync(this.workDir)) {
      return true;
    }
    return false;
  }

  /** Run a shell command in the sandbox. */
  async runCommand(command: string, timeoutMs = 30_000): Promise<string> {
    const res = await this.post('/command', { command, timeoutMs });
    if (!res.startsWith('Error connecting to sandbox:')) {
      return res;
    }

    // Direct local workspace execution fallback
    if (this.workDir && existsSync(this.workDir)) {
      return this.executeLocalCommand(command, timeoutMs);
    }
    return res;
  }

  private async executeLocalCommand(command: string, timeoutMs: number): Promise<string> {
    return new Promise((resolveResult) => {
      const child = spawn('/bin/sh', ['-c', command], {
        cwd: this.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CI: '1' },
      });

      let output = '';
      let timedOut = false;

      child.stdout.on('data', (d) => (output += d));
      child.stderr.on('data', (d) => (output += d));

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {}
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          resolveResult(`"${command}" timed out after ${Math.round(timeoutMs / 1000)}s.`);
          return;
        }
        let text = output.trim();
        if (code !== 0 && code !== null) {
          text = text ? `${text}\n[exit code ${code}]` : `[exit code ${code}]`;
        }
        resolveResult(text || '(no output)');
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolveResult(`Error starting command: ${err.message}`);
      });
    });
  }

  /** Read a slice of lines from a file. */
  async readFile(path: string, offset = 1, limit = 200): Promise<string> {
    const res = await this.post('/read', { path, offset, limit });
    if (!res.startsWith('Error connecting to sandbox:')) {
      return res;
    }

    if (this.workDir && existsSync(this.workDir)) {
      const fullPath = resolve(this.workDir, path);
      try {
        const content = await fsReadFile(fullPath, 'utf8');
        const lines = content.split('\n');
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        return slice.map((l, i) => `${offset + i}: ${l}`).join('\n');
      } catch (err: any) {
        return `Error: File not found: ${path}`;
      }
    }
    return res;
  }

  /** Create or overwrite a file with full content. */
  async writeFile(path: string, content: string): Promise<string> {
    const res = await this.post('/write', { path, content });
    if (!res.startsWith('Error connecting to sandbox:')) {
      return res;
    }

    if (this.workDir && existsSync(this.workDir)) {
      const fullPath = resolve(this.workDir, path);
      try {
        await mkdir(dirname(fullPath), { recursive: true });
        await fsWriteFile(fullPath, content, 'utf8');
        return `File written successfully: ${path} (${content.length} bytes)`;
      } catch (err: any) {
        return `Error writing file: ${err.message}`;
      }
    }
    return res;
  }

  /** Replace exact text in a file. */
  async updateFile(
    path: string,
    old_str: string,
    new_str: string,
    allow_multi?: boolean,
  ): Promise<string> {
    const res = await this.post('/replace', { path, old_str, new_str, allow_multi });
    if (!res.startsWith('Error connecting to sandbox:')) {
      return res;
    }

    if (this.workDir && existsSync(this.workDir)) {
      const fullPath = resolve(this.workDir, path);
      try {
        const content = await fsReadFile(fullPath, 'utf8');
        const count = content.split(old_str).length - 1;
        if (count === 0) return `Error: old_str was not found in ${path}.`;
        if (count > 1 && !allow_multi) {
          return `Error: old_str matches ${count} times in ${path}. Set allow_multi to true to replace all.`;
        }
        await fsWriteFile(fullPath, content.split(old_str).join(new_str), 'utf8');
        return `Replaced ${count} occurrence(s) in ${path}.`;
      } catch (err: any) {
        return `Error updating file: ${err.message}`;
      }
    }
    return res;
  }

  /** Undo the most recent write or replace operation. */
  async undo(): Promise<string> {
    return this.post('/undo');
  }
}
