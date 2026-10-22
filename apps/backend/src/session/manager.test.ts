import { describe, expect, it } from 'vitest';
import { SessionManager } from './manager';
import { LocalSandboxProvider } from '../sandbox/provider';

describe('SessionManager', () => {
  it('creates and tracks sessions with isolated sandboxes', async () => {
    const provider = new LocalSandboxProvider({ basePort: 5050 });
    const manager = new SessionManager({ provider });

    const session1 = await manager.getOrCreateSession('chat-abc', 'org/repo-a');
    expect(session1.id).toBe('chat-abc');
    expect(session1.repo).toBe('org/repo-a');
    expect(session1.sandbox.port).toBe(5050);
    expect(session1.sandbox.url).toBe('http://127.0.0.1:5050');
    expect(session1.client).toBeDefined();

    // Re-retrieving the same session should return the cached session
    const sameSession = await manager.getOrCreateSession('chat-abc');
    expect(sameSession).toBe(session1);

    // Creating another session gets a distinct sandbox and next port
    const session2 = await manager.getOrCreateSession('chat-def', 'org/repo-b');
    expect(session2.id).toBe('chat-def');
    expect(session2.sandbox.port).toBe(5051);

    expect(manager.listSessions()).toHaveLength(2);
    expect(manager.count()).toBe(2);

    // Terminating session releases sandbox
    const terminated = await manager.terminateSession('chat-abc');
    expect(terminated).toBe(true);
    expect(manager.getSession('chat-abc')).toBeUndefined();
    expect(manager.count()).toBe(1);

    // Terminating non-existent session returns false
    const terminatedAgain = await manager.terminateSession('non-existent');
    expect(terminatedAgain).toBe(false);
  });
});
