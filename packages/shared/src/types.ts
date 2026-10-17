/**
 * The contract — every layer compiles against these types.
 * Frontend, Backend, Agent Swarm, and Sandbox all import from @cloud-agent/shared,
 * so a mismatch between layers is a compile error, not a runtime surprise.
 */

// ---------------------------------------------------------------------------
// Task lifecycle
// ---------------------------------------------------------------------------

export type TaskStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed';

export interface Task {
  id: string;
  status: TaskStatus;
  instruction: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Tools (what the agent swarm can call)
// ---------------------------------------------------------------------------

export const TOOL_NAMES = [
  'create_shell',
  'run_command',
  'read_file',
  'write_file',
  'update_file',
  'delete_file',
  'undo',
  'create_pull_request',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolCall {
  id: string;
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  ok: boolean;
  output?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// WebSocket events — the wire contract between frontend and backend
// ---------------------------------------------------------------------------

/** Messages the frontend sends to the backend. */
export type ClientEvent =
  | { type: 'session.create'; repoUrl: string; branch?: string }
  | { type: 'task.create'; instruction: string }
  | { type: 'question.answer'; questionId: string; answer: string };

/** Messages the backend streams to the frontend. */
export type ServerEvent =
  | { type: 'agent.thinking'; text: string }
  | { type: 'agent.message'; message: ChatMessage }
  | { type: 'shell.output'; shellId: string; chunk: string; stream: 'stdout' | 'stderr' }
  | { type: 'file.changed'; path: string; diff: string }
  | { type: 'browser.screenshot'; imageBase64: string }
  | { type: 'question.asked'; questionId: string; text: string }
  | { type: 'task.status'; status: TaskStatus };

// ---------------------------------------------------------------------------
// Type guards (used by the WebSocket layer to narrow unknown JSON payloads)
// ---------------------------------------------------------------------------

function isEventWithType(value: unknown): value is { type: string } {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function isClientEvent(value: unknown): value is ClientEvent {
  return isEventWithType(value);
}

export function isServerEvent(value: unknown): value is ServerEvent {
  return isEventWithType(value);
}
