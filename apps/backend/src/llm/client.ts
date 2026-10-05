/**
 * LLM Client — the brain's connection to an LLM provider.
 *
 * WHY an interface? Because the agent loop should NOT know whether it's
 * talking to OpenAI, Anthropic, or a local model. It just calls
 * `client.chat(messages, tools)` and gets back a response.
 * This is the **Dependency Inversion Principle** — high-level logic (the loop)
 * depends on an abstraction, not a concrete API.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What the LLM returns: either plain text, or a request to call a tool. */
export interface LLMResponse {
  role: 'assistant';
  content: string | null;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }[];
  /** Token counts for this call (prompt = everything we sent, resent every lap). */
  usage?: { promptTokens: number; completionTokens: number };
}

/** Tool definition — tells the LLM "you have this tool available." */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

/** The interface every LLM provider must implement. */
export interface LLMClient {
  chat(messages: ChatCompletionMessageParam[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// OpenAI Implementation
// ---------------------------------------------------------------------------

export class OpenAIClient implements LLMClient {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey?: string, model = 'gpt-4o') {
    this.openai = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
    this.model = model;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse> {
    // Convert our ToolDefinition format to OpenAI's expected format
    const openaiTools: ChatCompletionTool[] | undefined = tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      tools: openaiTools,
      // When tools are provided, the model might call one or might just talk.
      // `auto` lets it decide.
      tool_choice: openaiTools && openaiTools.length > 0 ? 'auto' : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response from LLM');
    }

    const msg = choice.message;
    const usage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
        }
      : undefined;

    // The LLM might return tool calls — or it might just return text.
    // We need to handle both cases.
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content,
        toolCalls: msg.tool_calls
          .filter((tc) => tc.type === 'function')
          .map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            // The LLM returns arguments as a JSON string — we parse it
            arguments: JSON.parse(tc.function.arguments),
          })),
        usage,
      };
    }

    return {
      role: 'assistant',
      content: msg.content,
      usage,
    };
  }
}
