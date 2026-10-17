/**
 * GitHub Tools — agent tool handlers for GitHub interactions.
 *
 * Exposes:
 *  - create_pull_request: Allows the agent to open a PR on GitHub once work is done.
 */

import { createPullRequest, type GitHubApiOptions } from '../github/pr';
import type { ToolHandler, ToolRegistry } from './registry';

export type TokenProvider = string | (() => Promise<string> | string);

/**
 * Creates the `create_pull_request` tool handler.
 */
export function createPullRequestTool(
  tokenProvider: TokenProvider,
  options: GitHubApiOptions = {},
): ToolHandler {
  return {
    definition: {
      name: 'create_pull_request',
      description:
        'Create a GitHub Pull Request to propose changes from a feature branch into the base branch (e.g. "main"). Use this after committing and pushing changes in the sandbox.',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'The owner or organization of the GitHub repository (e.g. "octocat")',
          },
          repo: {
            type: 'string',
            description: 'The name of the GitHub repository (e.g. "Hello-World")',
          },
          title: {
            type: 'string',
            description: 'A concise title summarizing the pull request',
          },
          head: {
            type: 'string',
            description: 'The name of the branch containing the committed changes (e.g. "fix/calc-bug")',
          },
          base: {
            type: 'string',
            description: 'The target branch to merge into (usually "main" or "master")',
          },
          body: {
            type: 'string',
            description: 'Optional Markdown description explaining the changes made and tests run',
          },
          draft: {
            type: 'boolean',
            description: 'Whether to open the pull request as a draft (default: false)',
          },
        },
        required: ['owner', 'repo', 'title', 'head', 'base'],
        additionalProperties: false,
      },
    },
    async execute(args) {
      const token = typeof tokenProvider === 'function' ? await tokenProvider() : tokenProvider;
      const owner = args.owner as string;
      const repo = args.repo as string;
      const title = args.title as string;
      const head = args.head as string;
      const base = args.base as string;
      const body = args.body as string | undefined;
      const draft = args.draft as boolean | undefined;

      const result = await createPullRequest(
        token,
        { owner, repo, title, head, base, body, draft },
        options,
      );

      return `Successfully created Pull Request #${result.number}: "${result.title}"\nURL: ${result.htmlUrl}\nStatus: ${result.state}\nBranch: ${result.head} -> ${result.base}`;
    },
  };
}

/**
 * Registers the create_pull_request tool into a ToolRegistry.
 */
export function registerGitHubTools(
  registry: ToolRegistry,
  tokenProvider: TokenProvider,
  options: GitHubApiOptions = {},
): void {
  registry.register('create_pull_request', createPullRequestTool(tokenProvider, options));
}
