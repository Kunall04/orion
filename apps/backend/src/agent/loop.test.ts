import { describe, expect, it } from 'vitest';
import type { LLMClient, LLMResponse } from '../llm/client';
import { ToolRegistry } from '../tools/registry';
import { echoTool } from '../tools/stubs';
import { AgentLoop, type AgentEvent } from './loop';

/** Fake LLM: returns the scripted replies in order, so no API key is needed. */
function fakeLLM(replies: LLMResponse[]): LLMClient {
  let i = 0;
  return { chat: async () => replies[i++]! };
}

describe('AgentLoop', () => {
  it('runs a tool, then finishes, and reports tokens per lap', async () => {
    const tools = new ToolRegistry();
    tools.register('echo', echoTool);

    const llm = fakeLLM([
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', name: 'echo', arguments: { message: 'hi' } }],
        usage: { promptTokens: 100, completionTokens: 10 },
      },
      { role: 'assistant', content: 'done', usage: { promptTokens: 150, completionTokens: 5 } },
    ]);

    const events: AgentEvent[] = [];
    const loop = new AgentLoop({ llm, tools, ctx: { cwd: '.' }, onEvent: (e) => events.push(e) });

    expect(await loop.run('say hi')).toBe('done');
    expect(events.filter((e) => e.type === 'usage')).toEqual([
      { type: 'usage', lap: 1, promptTokens: 100, completionTokens: 10 },
      { type: 'usage', lap: 2, promptTokens: 150, completionTokens: 5 },
    ]);
  });
});
