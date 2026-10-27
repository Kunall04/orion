import { describe, expect, it, vi } from 'vitest';
import { SandboxClient } from '../sandbox/client';
import { ToolRegistry } from './registry';
import { createSandboxTools, registerSandboxTools } from './sandbox';

describe('Sandbox Tools', () => {
  const dummyCtx = { cwd: '/workspace' };

  function createMockClient() {
    return {
      runCommand: vi.fn().mockResolvedValue('command output'),
      readFile: vi.fn().mockResolvedValue('line 1\nline 2'),
      writeFile: vi.fn().mockResolvedValue('Wrote 10 characters'),
      updateFile: vi.fn().mockResolvedValue('Replaced 1 occurrence'),
      undo: vi.fn().mockResolvedValue('restored previous version'),
      checkHealth: vi.fn().mockResolvedValue(true),
    } as unknown as SandboxClient;
  }

  it('registerSandboxTools registers all 5 tools', () => {
    const registry = new ToolRegistry();
    const mockClient = createMockClient();

    registerSandboxTools(registry, mockClient);

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(5);
    const names = defs.map((d) => d.name);
    expect(names).toEqual(['run_command', 'read_file', 'write_file', 'update_file', 'undo']);
  });

  it('createSandboxTools returns a map of all 5 tools', () => {
    const mockClient = createMockClient();
    const tools = createSandboxTools(mockClient);
    expect(Object.keys(tools)).toEqual([
      'run_command',
      'read_file',
      'write_file',
      'update_file',
      'undo',
    ]);
  });

  describe('run_command', () => {
    it('executes command when valid arguments are provided', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute(
        'run_command',
        { command: 'npm test', timeoutMs: 5000 },
        dummyCtx,
      );

      expect(mockClient.runCommand).toHaveBeenCalledWith('npm test', 5000);
      expect(out).toBe('command output');
    });

    it('backgrounds dev server commands and reads the output log', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      (mockClient.runCommand as any)
        .mockResolvedValueOnce('') // background start
        .mockResolvedValueOnce('VITE v5.4.14 ready in 250 ms\n➜ Local: http://localhost:3000/'); // cat log

      registerSandboxTools(registry, mockClient);

      const out = await registry.execute(
        'run_command',
        { command: 'npm run dev' },
        dummyCtx,
      );

      expect(mockClient.runCommand).toHaveBeenNthCalledWith(
        1,
        'npm run dev > /tmp/dev-server.log 2>&1 &',
      );
      expect(mockClient.runCommand).toHaveBeenNthCalledWith(2, 'cat /tmp/dev-server.log');
      expect(out).toContain('http://localhost:3000/');
    });

    it('rejects missing command parameter', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute('run_command', {}, dummyCtx);
      expect(out).toContain('Error: invalid arguments for "run_command"');
    });
  });

  describe('read_file', () => {
    it('calls readFile with path, offset and limit', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute(
        'read_file',
        { path: 'src/app.ts', offset: 10, limit: 50 },
        dummyCtx,
      );

      expect(mockClient.readFile).toHaveBeenCalledWith('src/app.ts', 10, 50);
      expect(out).toBe('line 1\nline 2');
    });

    it('rejects missing path parameter', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute('read_file', { offset: 1 }, dummyCtx);
      expect(out).toContain('Error: invalid arguments for "read_file"');
    });
  });

  describe('write_file', () => {
    it('calls writeFile with path and content', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute(
        'write_file',
        { path: 'notes.txt', content: 'hello' },
        dummyCtx,
      );

      expect(mockClient.writeFile).toHaveBeenCalledWith('notes.txt', 'hello');
      expect(out).toBe('Wrote 10 characters');
    });

    it('rejects missing content parameter', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute('write_file', { path: 'notes.txt' }, dummyCtx);
      expect(out).toContain('Error: invalid arguments for "write_file"');
    });
  });

  describe('update_file', () => {
    it('calls updateFile with path, old_str, new_str, and allow_multi', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute(
        'update_file',
        { path: 'a.js', old_str: 'foo', new_str: 'bar', allow_multi: true },
        dummyCtx,
      );

      expect(mockClient.updateFile).toHaveBeenCalledWith('a.js', 'foo', 'bar', true);
      expect(out).toBe('Replaced 1 occurrence');
    });

    it('rejects missing new_str parameter', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute('update_file', { path: 'a.js', old_str: 'foo' }, dummyCtx);
      expect(out).toContain('Error: invalid arguments for "update_file"');
    });
  });

  describe('undo', () => {
    it('calls undo with no parameters', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute('undo', {}, dummyCtx);

      expect(mockClient.undo).toHaveBeenCalled();
      expect(out).toBe('restored previous version');
    });

    it('rejects unexpected properties due to additionalProperties: false', async () => {
      const registry = new ToolRegistry();
      const mockClient = createMockClient();
      registerSandboxTools(registry, mockClient);

      const out = await registry.execute('undo', { unexpected: 123 }, dummyCtx);
      expect(out).toContain('Error: invalid arguments for "undo"');
    });
  });
});
