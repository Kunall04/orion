import { describe, expect, it } from 'vitest';
import { ToolRegistry } from './registry';
import { echoTool } from './stubs';

describe('ToolRegistry', () => {
  it('runs a tool with valid arguments', async () => {
    const registry = new ToolRegistry();
    registry.register('echo', echoTool);

    const out = await registry.execute('echo', { message: 'hi' }, { cwd: '.' });
    expect(out).toBe('hi');
  });

  it('rejects invalid arguments before running the tool', async () => {
    const registry = new ToolRegistry();
    registry.register('echo', echoTool);

    const out = await registry.execute('echo', { message: 42 }, { cwd: '.' });
    expect(out).toContain('invalid arguments');
  });
});
