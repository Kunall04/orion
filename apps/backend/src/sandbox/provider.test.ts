import { describe, expect, it, vi } from 'vitest';
import { DockerSandboxProvider, LocalSandboxProvider, PortPool } from './provider';

describe('PortPool', () => {
  it('acquires ports sequentially from basePort', () => {
    const pool = new PortPool(5001, 5005);
    expect(pool.acquire()).toBe(5001);
    expect(pool.acquire()).toBe(5002);
    expect(pool.acquire()).toBe(5003);
    expect(pool.isUsed(5001)).toBe(true);
    expect(pool.isUsed(5004)).toBe(false);
  });

  it('reuses released ports', () => {
    const pool = new PortPool(5001, 5003);
    const p1 = pool.acquire(); // 5001
    const p2 = pool.acquire(); // 5002
    expect(p1).toBe(5001);
    expect(p2).toBe(5002);

    pool.release(p1);
    expect(pool.isUsed(5001)).toBe(false);

    // Next acquire should pick up 5001 again
    expect(pool.acquire()).toBe(5001);
  });

  it('throws error when port pool is exhausted', () => {
    const pool = new PortPool(5001, 5002);
    pool.acquire(); // 5001
    pool.acquire(); // 5002
    expect(() => pool.acquire()).toThrow(/exhausted/);
  });
});

describe('LocalSandboxProvider', () => {
  it('creates an isolated sandbox instance with dynamic port and directory', async () => {
    const provider = new LocalSandboxProvider({ basePort: 5010 });
    const instance = await provider.createSandbox('session-1');

    expect(instance.id).toBe('session-1');
    expect(instance.port).toBe(5010);
    expect(instance.url).toBe('http://127.0.0.1:5010');
    expect(instance.workDir).toContain('session-1');
    expect(instance.status).toBe('ready');

    // Getting the same session returns the existing instance
    const cached = await provider.createSandbox('session-1');
    expect(cached).toBe(instance);

    // Next session gets next port
    const instance2 = await provider.createSandbox('session-2');
    expect(instance2.port).toBe(5011);

    expect(provider.listSandboxes()).toHaveLength(2);
    expect(provider.getSandbox('session-1')).toBe(instance);

    // Destroying releases the port
    await provider.destroySandbox('session-1');
    expect(provider.getSandbox('session-1')).toBeUndefined();
    expect(provider.listSandboxes()).toHaveLength(1);

    // Next sandbox can reuse port 5010
    const instance3 = await provider.createSandbox('session-3');
    expect(instance3.port).toBe(5010);
  });
});

describe('DockerSandboxProvider', () => {
  it('invokes docker commands when execFn is provided', async () => {
    const executedCommands: string[] = [];
    const mockExec = vi.fn(async (cmd: string) => {
      executedCommands.push(cmd);
      return { stdout: 'container123', stderr: '' };
    });

    const provider = new DockerSandboxProvider({
      basePort: 5020,
      imageName: 'test-sandbox:v1',
      execFn: mockExec,
    });

    const instance = await provider.createSandbox('session-docker-1');
    expect(instance.id).toBe('session-docker-1');
    expect(instance.port).toBe(5020);
    expect(instance.status).toBe('ready');

    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('docker run -d --name orion-sandbox-session-docker-1 -p 5020:5000 test-sandbox:v1'),
    );

    await provider.destroySandbox('session-docker-1');
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('docker rm -f orion-sandbox-session-docker-1'),
    );
  });
});
