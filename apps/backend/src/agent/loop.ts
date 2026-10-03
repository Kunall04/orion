/**
 * Agent Loop — the ReAct cycle.
 *
 * This is the brain of the whole system. The loop:
 *   1. Sends the conversation to the LLM (with tool definitions)
 *   2. LLM either responds with text (done!) or a tool call
 *   3. If tool call → execute it → append result → go to step 1
 *   4. If text → return the final answer
 *
 * The loop has a MAX_ITERATIONS safety valve to prevent infinite loops.
 *
 * WHAT YOU'RE LOOKING AT:
 * - `AgentLoop` class: the reusable loop engine
 * - `runAgentLoop()`: the entry point that wires everything together
 *
 * THIS FILE DOES NOT IMPORT any specific LLM provider or tool set.
 * It only depends on the interfaces (LLMClient, ToolRegistry).
 * That's the power of dependency inversion.
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { LLMClient, LLMResponse } from '../llm/client';
import type { ToolRegistry, ToolContext } from '../tools/registry';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 15; // Safety valve — prevent infinite loops
const SYSTEM_PROMPT = `You are a software engineering assistant. You help users fix bugs, add features, and understand code.

When you receive a task:
1. Think about what you need to do
2. Use your tools to investigate and make changes
3. Verify your work
4. Report back with a summary

Be concise. Use tools when you need to read files, run commands, or make edits.
When you're done, respond with a clear summary of what you did.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentLoopOptions {
  /** The LLM client to use */
  llm: LLMClient;
  /** The tool registry */
  tools: ToolRegistry;
  /** Session context (working directory, etc.) */
  ctx: ToolContext;
  /** Optional callback for streaming events */
  onEvent?: (event: AgentEvent) => void;
}

/** Events the loop emits — the frontend can listen to these */
export type AgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'message'; content: string }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// The Agent Loop
// ---------------------------------------------------------------------------

export class AgentLoop {
  private llm: LLMClient;
  private tools: ToolRegistry;
  private ctx: ToolContext;
  private onEvent?: (event: AgentEvent) => void;

  constructor(options: AgentLoopOptions) {
    this.llm = options.llm;
    this.tools = options.tools;
    this.ctx = options.ctx;
    this.onEvent = options.onEvent;
  }

  /**
   * Run the agent loop with a user instruction.
   *
   * This is the main entry point. It:
   * 1. Creates the initial message history
   * 2. Loops until the LLM stops calling tools or we hit the limit
   * 3. Returns the final response
   */
  async run(instruction: string): Promise<string> {
    // Start with the system prompt + user instruction
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: instruction },
    ];

    // Get tool definitions for the LLM
    const toolDefs = this.tools.getDefinitions();

    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      // Step 1: Send messages to the LLM
      this.emit({ type: 'thinking', text: `Iteration ${iteration}...` });

      let response: LLMResponse;
      try {
        response = await this.llm.chat(messages, toolDefs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', message: `LLM error: ${msg}` });
        return `Error: LLM call failed — ${msg}`;
      }

      // Step 2: If the LLM returned text with no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const finalAnswer = response.content ?? '(no response)';
        this.emit({ type: 'message', content: finalAnswer });
        return finalAnswer;
      }

      // Step 3: The LLM wants to call tools
      // First, add the assistant's response to the conversation
      messages.push({
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });

      // Step 4: Execute each tool call and add results
      for (const toolCall of response.toolCalls) {
        this.emit({
          type: 'tool_call',
          name: toolCall.name,
          args: toolCall.arguments,
        });

        const result = await this.tools.execute(toolCall.name, toolCall.arguments, this.ctx);

        this.emit({ type: 'tool_result', name: toolCall.name, result });

        // Add the tool result to the conversation
        // The LLM needs to see what happened so it can decide what to do next
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });
      }
    }

    // If we hit the iteration limit, stop and report
    const limitMsg = `Reached maximum iterations (${MAX_ITERATIONS}). Stopping.`;
    this.emit({ type: 'error', message: limitMsg });
    return limitMsg;
  }

  private emit(event: AgentEvent): void {
    this.onEvent?.(event);
  }
}

// ---------------------------------------------------------------------------
// Convenience function — wire everything together
// ---------------------------------------------------------------------------

export async function runAgentLoop(
  options: AgentLoopOptions & { instruction: string },
): Promise<string> {
  const loop = new AgentLoop(options);
  return loop.run(options.instruction);
}
