/**
 * Stub Tools — simple tools for testing the agent loop.
 *
 * WHY stubs? Before we build real tools (shell, file ops), we need to
 * verify the agent loop works end-to-end. These stubs let us test
 * the loop without touching the filesystem or running commands.
 *
 * Later phases replace these with real implementations:
 *   echo → shell command execution
 *   sleep → PTY-backed background process
 */

import type { ToolHandler } from './registry';

// ---------------------------------------------------------------------------
// Echo Tool — repeats back whatever you send
// ---------------------------------------------------------------------------

export const echoTool: ToolHandler = {
  definition: {
    name: 'echo',
    description: 'Echoes back the input message. Useful for testing the tool pipeline.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to echo back',
        },
      },
      required: ['message'],
    },
  },

  async execute(args) {
    const message = args.message;
    if (typeof message !== 'string') {
      return 'Error: "message" must be a string';
    }
    // In a real tool, this would execute a shell command or read a file.
    // Here we just return the message — same interface, trivial implementation.
    return message;
  },
};

// ---------------------------------------------------------------------------
// Sleep Tool — pauses for N milliseconds
// ---------------------------------------------------------------------------

export const sleepTool: ToolHandler = {
  definition: {
    name: 'sleep',
    description:
      'Pauses execution for a specified number of milliseconds. Useful for testing async tool behavior.',
    parameters: {
      type: 'object',
      properties: {
        ms: {
          type: 'number',
          description: 'Number of milliseconds to sleep',
        },
      },
      required: ['ms'],
    },
  },

  async execute(args) {
    const ms = args.ms;
    if (typeof ms !== 'number' || ms < 0) {
      return 'Error: "ms" must be a non-negative number';
    }

    // Cap at 5 seconds for safety — we don't want the agent to hang forever
    const safeMs = Math.min(ms, 5000);

    await new Promise((resolve) => setTimeout(resolve, safeMs));
    return `Slept for ${safeMs}ms`;
  },
};
