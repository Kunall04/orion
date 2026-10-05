/**
 * Tool Registry — the agent's toolbox.
 *
 * The registry is a typed map: tool name → { definition, handler }.
 * The LLM sees the definitions (so it knows what tools exist).
 * The agent loop calls the handlers (so tools actually execute).
 *
 * WHY a registry? Because tools are pluggable. You can add a new tool
 * by adding one entry — no need to touch the agent loop or the LLM client.
 */

import type { ToolDefinition } from '../llm/client';
import Ajv from 'ajv';

const ajv = new Ajv();

/** Max characters of tool output kept in the conversation. */
export const MAX_OUTPUT = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What a tool handler receives and returns. */
export interface ToolContext {
  /** The session's working directory */
  cwd: string;
  /** Any other session-scoped state */
  [key: string]: unknown;
}

export interface ToolHandler {
  /** The definition the LLM sees (name, description, parameters schema) */
  definition: ToolDefinition;
  /** The function that actually executes the tool */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  /** Register a tool by name */
  register(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  /** Get all tool definitions — this is what we send to the LLM */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** Execute a tool by name — called by the agent loop */
  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: Unknown tool "${name}". Available tools: ${Array.from(this.tools.keys()).join(', ')}`;
    }

    const check = ajv.compile(tool.definition.parameters);
    if (!check(args)) {
      return `Error: invalid arguments for "${name}": ${ajv.errorsText(check.errors)}`;
    }

    try {
      const out = await tool.execute(args, ctx);
      // Output is resent to the LLM every lap, so cap it (and say so, so the LLM knows).
      return out.length > MAX_OUTPUT
        ? `${out.slice(0, MAX_OUTPUT)}\n…[truncated, ${out.length - MAX_OUTPUT} more characters]`
        : out;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error executing tool "${name}": ${message}`;
    }
  }
}
