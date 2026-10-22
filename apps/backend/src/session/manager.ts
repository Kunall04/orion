import { SandboxClient } from '../sandbox/client';
import { type SandboxInstance, type SandboxProvider, LocalSandboxProvider } from '../sandbox/provider';

export interface Session {
  id: string;
  repo?: string;
  sandbox: SandboxInstance;
  client: SandboxClient;
  createdAt: number;
}

export interface SessionManagerOptions {
  provider?: SandboxProvider;
  clientFactory?: (url: string) => SandboxClient;
}

/**
 * SessionManager coordinates multi-chat sessions and maps each session
 * to its dedicated sandbox environment (port, directory, or container).
 */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly provider: SandboxProvider;
  private readonly clientFactory: (url: string) => SandboxClient;

  constructor(options: SessionManagerOptions = {}) {
    this.provider = options.provider ?? new LocalSandboxProvider();
    this.clientFactory = options.clientFactory ?? ((url: string) => new SandboxClient({ baseUrl: url }));
  }

  async getOrCreateSession(sessionId: string, repo?: string): Promise<Session> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (repo && !existing.repo) {
        existing.repo = repo;
      }
      return existing;
    }

    const sandbox = await this.provider.createSandbox(sessionId, { repo });
    const client = this.clientFactory(sandbox.url);

    const session: Session = {
      id: sessionId,
      repo,
      sandbox,
      client,
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await this.provider.destroySandbox(sessionId);
    this.sessions.delete(sessionId);
    return true;
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  count(): number {
    return this.sessions.size;
  }
}
