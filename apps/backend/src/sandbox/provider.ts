import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface SandboxInstance {
  id: string;
  url: string;
  port: number;
  workDir: string;
  status: 'starting' | 'ready' | 'stopped' | 'failed';
  createdAt: number;
}

export interface SandboxCreateOptions {
  repo?: string;
  env?: Record<string, string>;
}

export interface SandboxProvider {
  createSandbox(sessionId: string, options?: SandboxCreateOptions): Promise<SandboxInstance>;
  getSandbox(sessionId: string): SandboxInstance | undefined;
  destroySandbox(sessionId: string): Promise<void>;
  listSandboxes(): SandboxInstance[];
}

/**
 * PortPool manages dynamic port allocation so multiple containers
 * on the host laptop never collide on the same port.
 */
export class PortPool {
  private readonly basePort: number;
  private readonly maxPort: number;
  private readonly usedPorts = new Set<number>();

  constructor(basePort = 5001, maxPort = 5100) {
    this.basePort = basePort;
    this.maxPort = maxPort;
  }

  acquire(): number {
    for (let p = this.basePort; p <= this.maxPort; p++) {
      if (!this.usedPorts.has(p)) {
        this.usedPorts.add(p);
        return p;
      }
    }
    throw new Error(`Port pool exhausted (range: ${this.basePort}-${this.maxPort})`);
  }

  release(port: number): void {
    this.usedPorts.delete(port);
  }

  isUsed(port: number): boolean {
    return this.usedPorts.has(port);
  }
}

/**
 * LocalSandboxProvider:
 * Allocates a unique port and isolated workspace directory per session.
 * Ideal for local development, fast unit tests, and lightweight environments.
 */
export class LocalSandboxProvider implements SandboxProvider {
  private readonly sandboxes = new Map<string, SandboxInstance>();
  private readonly portPool: PortPool;
  private readonly baseWorkDir: string;
  private readonly host: string;

  constructor(options: { basePort?: number; maxPort?: number; baseWorkDir?: string; host?: string } = {}) {
    this.portPool = new PortPool(options.basePort ?? 5001, options.maxPort ?? 5100);
    this.baseWorkDir = options.baseWorkDir ?? join(tmpdir(), 'orion-workspaces');
    this.host = options.host ?? '127.0.0.1';
  }

  async createSandbox(sessionId: string, _options?: SandboxCreateOptions): Promise<SandboxInstance> {
    if (this.sandboxes.has(sessionId)) {
      return this.sandboxes.get(sessionId)!;
    }

    const port = this.portPool.acquire();
    const workDir = join(this.baseWorkDir, sessionId);

    try {
      mkdirSync(workDir, { recursive: true });
    } catch {}

    const instance: SandboxInstance = {
      id: sessionId,
      port,
      url: `http://${this.host}:${port}`,
      workDir,
      status: 'ready',
      createdAt: Date.now(),
    };

    this.sandboxes.set(sessionId, instance);
    return instance;
  }

  getSandbox(sessionId: string): SandboxInstance | undefined {
    return this.sandboxes.get(sessionId);
  }

  async destroySandbox(sessionId: string): Promise<void> {
    const instance = this.sandboxes.get(sessionId);
    if (!instance) return;

    this.portPool.release(instance.port);
    try {
      rmSync(instance.workDir, { recursive: true, force: true });
    } catch {}

    this.sandboxes.delete(sessionId);
  }

  listSandboxes(): SandboxInstance[] {
    return Array.from(this.sandboxes.values());
  }
}

/**
 * DockerSandboxProvider:
 * Provisions dedicated Docker containers via the Docker CLI / Engine.
 * Each container maps a unique host port (e.g. 5001, 5002) to internal container port 5000.
 */
export class DockerSandboxProvider implements SandboxProvider {
  private readonly sandboxes = new Map<string, SandboxInstance>();
  private readonly portPool: PortPool;
  private readonly imageName: string;
  private readonly host: string;
  private readonly execFn?: (cmd: string) => Promise<{ stdout: string; stderr: string }>;

  constructor(options: {
    basePort?: number;
    maxPort?: number;
    imageName?: string;
    host?: string;
    execFn?: (cmd: string) => Promise<{ stdout: string; stderr: string }>;
  } = {}) {
    this.portPool = new PortPool(options.basePort ?? 5001, options.maxPort ?? 5100);
    this.imageName = options.imageName ?? 'orion-sandbox:latest';
    this.host = options.host ?? '127.0.0.1';
    this.execFn = options.execFn;
  }

  async createSandbox(sessionId: string, _options?: SandboxCreateOptions): Promise<SandboxInstance> {
    if (this.sandboxes.has(sessionId)) {
      return this.sandboxes.get(sessionId)!;
    }

    const port = this.portPool.acquire();
    const containerName = `orion-sandbox-${sessionId}`;

    const instance: SandboxInstance = {
      id: sessionId,
      port,
      url: `http://${this.host}:${port}`,
      workDir: '/workspace',
      status: 'starting',
      createdAt: Date.now(),
    };

    this.sandboxes.set(sessionId, instance);

    if (this.execFn) {
      try {
        await this.execFn(`docker run -d --name ${containerName} -p ${port}:5000 ${this.imageName}`);
        instance.status = 'ready';
      } catch (err) {
        instance.status = 'failed';
      }
    } else {
      instance.status = 'ready';
    }

    return instance;
  }

  getSandbox(sessionId: string): SandboxInstance | undefined {
    return this.sandboxes.get(sessionId);
  }

  async destroySandbox(sessionId: string): Promise<void> {
    const instance = this.sandboxes.get(sessionId);
    if (!instance) return;

    const containerName = `orion-sandbox-${sessionId}`;
    this.portPool.release(instance.port);

    if (this.execFn) {
      try {
        await this.execFn(`docker rm -f ${containerName}`);
      } catch {}
    }

    this.sandboxes.delete(sessionId);
  }

  listSandboxes(): SandboxInstance[] {
    return Array.from(this.sandboxes.values());
  }
}
