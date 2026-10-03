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

    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error executing tool "${name}": ${message}`;
    }
  }
}
