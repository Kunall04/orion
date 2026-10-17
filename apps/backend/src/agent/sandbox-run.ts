/**
 * Sandbox Runner Script — runs the real agent loop connected to the Docker sandbox.
 *
 * USAGE:
 *   cd apps/backend
 *   npx tsx --env-file=.env src/agent/sandbox-run.ts
 *
 * WHAT THIS DOES:
 * 1. Connects to the running Docker sandbox runner over HTTP (port 5001).
 * 2. Seeds a small broken project in /workspace (calc.js has a bug, test.js fails).
 * 3. Registers our 5 real sandbox tools (run_command, read_file, update_file, etc.).
 * 4. Runs the AgentLoop with Groq / OpenAI to fix the bug and verify tests pass.
 */

import { OpenAIClient } from '../llm/client';
import { SandboxClient } from '../sandbox/client';
import { ToolRegistry } from '../tools/registry';
import { registerSandboxTools } from '../tools/sandbox';
import { AgentLoop, type AgentEvent } from './loop';

const SANDBOX_URL = process.env.SANDBOX_URL ?? 'http://127.0.0.1:5001';

/** Seed a minimal broken test project into the sandbox workspace */
async function seedBrokenProject(client: SandboxClient): Promise<void> {
  console.log('🌱 Seeding broken project into sandbox (/workspace)...');

  await client.writeFile(
    'package.json',
    JSON.stringify(
      {
        name: 'sample-project',
        version: '1.0.0',
        scripts: { test: 'node test.js' },
      },
      null,
      2,
    ) + '\n',
  );

  await client.writeFile(
    'calc.js',
    `// Basic calculator functions\nfunction add(a, b) {\n  // BUG: subtracts instead of adds!\n  return a - b;\n}\n\nmodule.exports = { add };\n`,
  );

  await client.writeFile(
    'test.js',
    `const assert = require('node:assert');\nconst { add } = require('./calc');\n\nconsole.log('Running tests...');\nassert.strictEqual(add(2, 3), 5, 'add(2, 3) should equal 5');\nconsole.log('All tests passed!');\n`,
  );

  console.log('🌱 Project seeded! Initial state: npm test will fail.\n');
}

async function main() {
  const sandbox = new SandboxClient({ baseUrl: SANDBOX_URL });

  // 1. Verify the sandbox is reachable
  const isHealthy = await sandbox.checkHealth();
  if (!isHealthy) {
    console.error(`❌ Could not connect to sandbox at ${SANDBOX_URL}.`);
    console.error('Please make sure the Docker container is running:');
    console.error('  docker run -d --name orion-sandbox -p 5001:5000 orion-sandbox');
    process.exit(1);
  }
  console.log(`📡 Connected to Docker sandbox at ${SANDBOX_URL} (healthy)`);

  // 2. Seed the broken project
  await seedBrokenProject(sandbox);

  // 3. Setup LLM client
  const llm = new OpenAIClient(
    process.env.LLM_API_KEY,
    process.env.LLM_MODEL,
    process.env.LLM_BASE_URL,
  );

  // 4. Register real sandbox tools
  const tools = new ToolRegistry();
  registerSandboxTools(tools, sandbox);

  // 5. Instruction
  const instruction =
    process.argv[2] ??
    'Run the test suite with npm test, inspect any error, fix the bug in the code, and confirm that npm test passes.';

  console.log('🧠 Orion Agent — Starting end-to-end task...\n');
  console.log(`📝 Instruction: "${instruction}"\n`);
  console.log('─'.repeat(60));

  const loop = new AgentLoop({
    llm,
    tools,
    ctx: { cwd: '/workspace' },
    onEvent: (event: AgentEvent) => {
      switch (event.type) {
        case 'thinking':
          console.log(`\n💭 Thinking:\n${event.text}`);
          break;
        case 'tool_call':
          console.log(`\n🔧 Tool Call: ${event.name}`);
          console.log(`   Arguments: ${JSON.stringify(event.args, null, 2)}`);
          break;
        case 'tool_result':
          console.log(`\n📤 Tool Result (${event.name}):`);
          console.log(`   ${event.result.trim().replace(/\n/g, '\n   ')}`);
          break;
        case 'usage':
          console.log(
            `\n🔢 Lap ${event.lap}: ${event.promptTokens} prompt tokens, ${event.completionTokens} completion tokens`,
          );
          break;
        case 'message':
          console.log(`\n💬 Agent:\n${event.content}`);
          break;
        case 'error':
          console.log(`\n❌ Error: ${event.message}`);
          break;
      }
    },
  });

  const finalAnswer = await loop.run(instruction);

  console.log('\n' + '─'.repeat(60));
  console.log(`🏁 Task Complete! Final Answer:\n${finalAnswer}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
