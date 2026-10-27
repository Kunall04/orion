/**
 * Sandbox Tools — the real tools exposed to the agent loop.
 *
 * Each tool has:
 *  - definition: The English description and JSON Schema the LLM reads.
 *  - execute: The TypeScript function that delegates to the SandboxClient.
 *
 * Tool names match ToolName in @cloud-agent/shared:
 *  - run_command
 *  - read_file
 *  - write_file
 *  - update_file
 *  - undo
 */

import type { ToolName } from '@cloud-agent/shared';
import type { SandboxClient } from '../sandbox/client';
import type { ToolHandler, ToolRegistry } from './registry';

export type SandboxToolName = Extract<
  ToolName,
  'run_command' | 'read_file' | 'write_file' | 'update_file' | 'undo'
>;

/**
 * Creates the 5 sandbox tool handlers wired to a SandboxClient instance.
 */
export function createSandboxTools(client: SandboxClient): Record<SandboxToolName, ToolHandler> {
  return {
    run_command: {
      definition: {
        name: 'run_command',
        description:
          'Execute a shell command inside the project sandbox. Use this to run test suites, linters, package managers, and inspect directory contents. Commands have closed stdin and will time out if stuck.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The exact shell command to execute, e.g. "npm test" or "git status"',
            },
            timeoutMs: {
              type: 'number',
              description: 'Optional timeout in milliseconds (default 30,000, max 300,000)',
            },
          },
          required: ['command'],
          additionalProperties: false,
        },
      },
      async execute(args) {
        const command = (args.command as string || '').trim();
        const timeoutMs = args.timeoutMs as number | undefined;

        // Dev servers are long-running foreground processes that would otherwise block
        // until timeoutMs (30s) and then get killed. We background them and capture early output.
        const isDevServer =
          /^(npm\s+(run\s+)?(dev|start)|yarn\s+(run\s+)?(dev|start)|pnpm\s+(run\s+)?(dev|start)|npx\s+vite|vite)(\s+.*)?$/.test(
            command,
          ) && !command.includes('&');

        if (isDevServer) {
          await client.runCommand(`${command} > /tmp/dev-server.log 2>&1 &`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const logOutput = await client.runCommand('cat /tmp/dev-server.log');
          if (logOutput && !logOutput.includes('No such file or directory')) {
            return logOutput;
          }
          return `[Started dev server in background: ${command}]`;
        }

        return client.runCommand(command, timeoutMs);
      },
    },

    read_file: {
      definition: {
        name: 'read_file',
        description:
          'Read content from a file in the project. Returns line-numbered text. Use offset and limit to read large files in chunks (default 200 lines).',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file inside the project, e.g. "src/index.ts"',
            },
            offset: {
              type: 'integer',
              minimum: 1,
              description: '1-indexed line number to start reading from (default 1)',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 2000,
              description: 'Maximum number of lines to read (default 200)',
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
      async execute(args) {
        const path = args.path as string;
        const offset = args.offset as number | undefined;
        const limit = args.limit as number | undefined;
        return client.readFile(path, offset, limit);
      },
    },

    write_file: {
      definition: {
        name: 'write_file',
        description:
          'Create a new file or completely overwrite an existing file with the provided content. Missing parent directories are created automatically. The previous content is backed up so it can be reverted with undo.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file inside the project',
            },
            content: {
              type: 'string',
              description: 'The full text content to write into the file',
            },
          },
          required: ['path', 'content'],
          additionalProperties: false,
        },
      },
      async execute(args) {
        const path = args.path as string;
        const content = args.content as string;
        return client.writeFile(path, content);
      },
    },

    update_file: {
      definition: {
        name: 'update_file',
        description:
          'Replace an exact snippet of text in a file. Always read the file first to copy the exact lines you want to change. old_str must appear exactly once in the file unless allow_multi is set to true. Automatically saves a snapshot for undo.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file inside the project',
            },
            old_str: {
              type: 'string',
              description: 'The exact string to find and replace (must match exactly once)',
            },
            new_str: {
              type: 'string',
              description: 'The replacement string',
            },
            allow_multi: {
              type: 'boolean',
              description: 'Set to true only if you want to replace all occurrences',
            },
          },
          required: ['path', 'old_str', 'new_str'],
          additionalProperties: false,
        },
      },
      async execute(args) {
        const path = args.path as string;
        const old_str = args.old_str as string;
        const new_str = args.new_str as string;
        const allow_multi = args.allow_multi as boolean | undefined;
        return client.updateFile(path, old_str, new_str, allow_multi);
      },
    },

    undo: {
      definition: {
        name: 'undo',
        description:
          'Revert the most recent file modification made by write_file or update_file. Can be called repeatedly to walk back multiple file changes in reverse order.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      async execute() {
        return client.undo();
      },
    },
  };
}

/**
 * Registers all 5 sandbox tools into the provided ToolRegistry.
 */
export function registerSandboxTools(registry: ToolRegistry, client: SandboxClient): void {
  const tools = createSandboxTools(client);
  for (const [name, handler] of Object.entries(tools)) {
    registry.register(name, handler);
  }
}
