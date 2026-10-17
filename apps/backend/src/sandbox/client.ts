/**
 * Sandbox Client — the backend's HTTP telephone to the sandbox runner.
 *
 * The sandbox runs on its own port (or inside Docker). This client sends
 * HTTP requests to its routes and returns the plain string output.
 *
 * Every route on the sandbox returns `{ output: string }`.
 * If the network fails or the sandbox errors, this client catches it
 * and returns a clear error string so the LLM knows what went wrong.
 */

export interface SandboxClientOptions {
  /** Base URL of the sandbox runner, e.g. "http://127.0.0.1:3001" */
  baseUrl: string;
  /** Optional custom fetch implementation (useful for tests or custom dispatchers) */
  fetch?: typeof fetch;
}

export class SandboxClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: SandboxClientOptions) {
    // Strip trailing slash so path concatenation is always clean
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Helper to POST JSON to the sandbox and return the "output" text.
   * If the request fails, it returns an "Error: ..." string instead of throwing,
   * because tool outputs are fed straight into the LLM conversation.
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
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean };
      return data.ok === true;
    } catch {
      return false;
    }
  }

  /** Run a shell command in the sandbox. */
  async runCommand(command: string, timeoutMs?: number): Promise<string> {
    return this.post('/command', { command, timeoutMs });
  }

  /** Read a slice of lines from a file. */
  async readFile(path: string, offset?: number, limit?: number): Promise<string> {
    return this.post('/read', { path, offset, limit });
  }

  /** Create or overwrite a file with full content. */
  async writeFile(path: string, content: string): Promise<string> {
    return this.post('/write', { path, content });
  }

  /** Replace exact text in a file (must match once unless allow_multi is true). */
  async updateFile(
    path: string,
    old_str: string,
    new_str: string,
    allow_multi?: boolean,
  ): Promise<string> {
    return this.post('/replace', { path, old_str, new_str, allow_multi });
  }

  /** Undo the most recent write or replace operation. */
  async undo(): Promise<string> {
    return this.post('/undo');
  }
}
