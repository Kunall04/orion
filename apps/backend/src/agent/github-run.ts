/**
 * End-to-End GitHub Agent Runner — clones a real repo, edits code, pushes a branch,
 * and opens a live Pull Request on GitHub.
 *
 * USAGE:
 *   cd apps/backend
 *   npx tsx --env-file=.env src/agent/github-run.ts [owner/repo] [optional-instruction]
 *
 * WHAT THIS DOES:
 * 1. Connects to the running Docker sandbox runner (port 5001).
 * 2. Cleans /workspace inside the sandbox container.
 * 3. Mints a 1-hour GitHub installation token using the App ID & private key PEM.
 * 4. Clones the target GitHub repository into /workspace using the token.
 * 5. Registers sandbox tools + the create_pull_request tool.
 * 6. Runs the AgentLoop (LLM):
 *    - Creates a new git branch (orion/...)
 *    - Updates a file in the repo
 *    - Commits and pushes the branch to GitHub
 *    - Calls create_pull_request to open a real PR on GitHub!
 */

import { createAppJwt, loadGitHubPrivateKey, mintInstallationToken } from '../github/auth';
import { cloneRepoToSandbox, listInstallationRepos } from '../github/repos';
import { OpenAIClient } from '../llm/client';
import { SandboxClient } from '../sandbox/client';
import { registerGitHubTools } from '../tools/github';
import { ToolRegistry } from '../tools/registry';
import { registerSandboxTools } from '../tools/sandbox';
import { AgentLoop, type AgentEvent } from './loop';

const SANDBOX_URL = process.env.SANDBOX_URL ?? 'http://127.0.0.1:5001';

async function main() {
  console.log('🌟 Orion GitHub Coding Agent — End-to-End Workflow\n');

  // 1. Verify Docker Sandbox Health
  const sandbox = new SandboxClient({ baseUrl: SANDBOX_URL });
  const isHealthy = await sandbox.checkHealth();
  if (!isHealthy) {
    console.error(`❌ Could not connect to Docker sandbox at ${SANDBOX_URL}.`);
    console.error('Please ensure the Docker container is running:');
    console.error('  docker run -d --name orion-sandbox -p 5001:5000 orion-sandbox:latest');
    process.exit(1);
  }
  console.log(`📡 Connected to Docker sandbox at ${SANDBOX_URL} (healthy)`);

  // 2. Load GitHub Credentials
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = loadGitHubPrivateKey(process.env, process.cwd());

  if (!appId || !installationId || !privateKey) {
    console.error(
      '❌ Missing GitHub App credentials in .env (GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_PRIVATE_KEY_PATH).',
    );
    process.exit(1);
  }

  // 3. Mint short-lived installation token
  console.log('🔐 Minting 1-hour GitHub installation access token...');
  const jwt = createAppJwt(appId, privateKey);
  const tokenRes = await mintInstallationToken(installationId, jwt);
  console.log(`🎟️  Token minted successfully (expires: ${tokenRes.expiresAt})`);

  // 4. Query accessible repositories to locate default branch
  const repos = await listInstallationRepos(tokenRes.token);
  if (repos.length === 0) {
    console.error('❌ No repositories found for this GitHub App installation.');
    process.exit(1);
  }

  const targetRepo = process.argv[2] ?? repos[0]?.fullName ?? 'Kunall04/agent-checkout-gate';
  const repoMeta = repos.find((r) => r.fullName.toLowerCase() === targetRepo.toLowerCase());
  const defaultBranch = repoMeta?.defaultBranch ?? 'main';
  const [owner, repo] = targetRepo.split('/');

  console.log(`📁 Target Repository: ${targetRepo} (default branch: ${defaultBranch})`);

  // 5. Clean sandbox /workspace and clone fresh
  console.log('🧹 Cleaning sandbox /workspace directory...');
  await sandbox.runCommand('rm -rf /workspace/* /workspace/.* 2>/dev/null || true');

  console.log(`📥 Cloning ${targetRepo} into sandbox /workspace...`);
  const cloneResult = await cloneRepoToSandbox(sandbox, targetRepo, tokenRes.token);
  if (!cloneResult.success) {
    console.error(`❌ Clone failed: ${cloneResult.output}`);
    process.exit(1);
  }
  console.log('✅ Repository cloned and git user configured inside sandbox.');

  // 6. Set up Tool Registry (Sandbox Tools + GitHub PR Tool)
  const tools = new ToolRegistry();
  registerSandboxTools(tools, sandbox);
  registerGitHubTools(tools, tokenRes.token);

  // 7. Setup LLM Client
  const llm = new OpenAIClient(
    process.env.LLM_API_KEY,
    process.env.LLM_MODEL,
    process.env.LLM_BASE_URL,
  );

  // 8. Generate task instruction
  const branchName = `orion/verify-workflow-${Math.floor(Date.now() / 1000)}`;
  const instruction =
    process.argv[3] ??
    `You are an autonomous cloud coding agent running in a Docker container.
Your task:
1. Create and checkout a new git branch named "${branchName}" using run_command: "git checkout -b ${branchName}".
2. Use write_file to create a file named "ORION_VERIFICATION.md" with this markdown content:
"# Orion Coding Agent Verification

This repository was verified by Orion Cloud Coding Agent.
- Branch: ${branchName}
- Sandbox: Docker (orion-sandbox)
- Status: Verified
"
3. Run "git status" and "git add ORION_VERIFICATION.md" using run_command.
4. Commit the change with message "chore: verify Orion coding agent workflow" using run_command.
5. Push the branch to origin using run_command: "git push -u origin ${branchName}".
6. Once the push succeeds, call the create_pull_request tool with:
   - owner: "${owner}"
   - repo: "${repo}"
   - title: "chore: verify Orion coding agent workflow"
   - head: "${branchName}"
   - base: "${defaultBranch}"
   - body: "Automated Pull Request created by Orion Coding Agent running inside Docker container."
7. Confirm that the PR was created and return its URL.`;

  console.log('\n' + '─'.repeat(60));
  console.log('🧠 Orion Agent — Starting end-to-end task...\n');
  console.log(`📝 Instruction:\n${instruction}\n`);
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
  console.error('\n❌ Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
