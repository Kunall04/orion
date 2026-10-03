/**
 * Test Script — run the agent loop with stub tools.
 *
 * USAGE:
 *   cd apps/backend
 *   npx tsx src/agent/test-run.ts
 *
 * WHAT THIS DOES:
 * 1. Creates an LLM client (requires OPENAI_API_KEY env var)
 * 2. Registers stub tools (echo, sleep)
 * 3. Runs the agent loop with a test instruction
 * 4. Prints every event to the terminal
 *
 * THIS IS YOUR FIRST END-TO-END TEST OF THE AGENT BRAIN.
 */

import { OpenAIClient } from '../llm/client';
import { ToolRegistry } from '../tools/registry';
import { echoTool, sleepTool } from '../tools/stubs';
import { AgentLoop, type AgentEvent } from './loop';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// 1. Create the LLM client
//    This connects to OpenAI's API using your API key
const llm = new OpenAIClient();

// 2. Create the tool registry and register our stub tools
//    Later, we'll register real tools here (shell, file ops, etc.)
const tools = new ToolRegistry();
tools.register('echo', echoTool);
tools.register('sleep', sleepTool);

// 3. Define the session context
//    This is what gets passed to every tool handler
const ctx = {
  cwd: process.cwd(),
};

// ---------------------------------------------------------------------------
// Run the loop
// ---------------------------------------------------------------------------

async function main() {
  const instruction = process.argv[2] ?? 'Echo back "hello world" using the echo tool';

  console.log('\n🧠 Agent Brain — Starting...\n');
  console.log(`📝 Instruction: "${instruction}"\n`);
  console.log('─'.repeat(60));

  const loop = new AgentLoop({
    llm,
    tools,
    ctx,
    onEvent: (event: AgentEvent) => {
      // Pretty-print every event so you can watch the agent think
      switch (event.type) {
        case 'thinking':
          console.log(`\n💭 Thinking: ${event.text}`);
          break;
        case 'tool_call':
          console.log(`\n🔧 Tool Call: ${event.name}`);
          console.log(`   Args: ${JSON.stringify(event.args, null, 2)}`);
          break;
        case 'tool_result':
          console.log(`\n📤 Tool Result: ${event.name}`);
          console.log(`   Output: ${event.result}`);
          break;
        case 'message':
          console.log(`\n💬 Agent: ${event.content}`);
          break;
        case 'error':
          console.log(`\n❌ Error: ${event.message}`);
          break;
      }
    },
  });

  const result = await loop.run(instruction);

  console.log('\n' + '─'.repeat(60));
  console.log(`✅ Final Answer: ${result}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
