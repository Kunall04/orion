import { describe, expect, it } from 'vitest';
import { MAX_OUTPUT, ToolRegistry, type ToolHandler } from './registry';
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
  it('truncates long output and says how much was cut', async () => {
    const big: ToolHandler = {
      definition: { name: 'big', description: 'long output', parameters: { type: 'object' } },
      async execute() {
        return 'x'.repeat(MAX_OUTPUT + 500);
      },
    };
    const registry = new ToolRegistry();
    registry.register('big', big);

    const out = await registry.execute('big', {}, { cwd: '.' });
    expect(out.startsWith('x'.repeat(MAX_OUTPUT))).toBe(true);
    expect(out).toContain('truncated, 500 more characters');
  });
});
