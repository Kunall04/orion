/**
 * GitHub Repositories — listing accessible repos and cloning them into the sandbox.
 *
 * Flow:
 * 1. listInstallationRepos: queries GitHub API GET /installation/repositories
 *    using the 1-hour installation token (ghs_...).
 * 2. cloneRepoToSandbox: instructs the SandboxClient to run `git clone` using
 *    GitHub's HTTPS x-access-token format, and configures committer identity.
 */

import type { SandboxClient } from '../sandbox/client';

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
}

export interface ListReposOptions {
  /** Optional custom fetch implementation (useful for tests or mocking) */
  fetch?: typeof fetch;
  /** Optional custom GitHub API base URL (default: https://api.github.com) */
  baseUrl?: string;
}

export interface CloneRepoOptions {
  /** Target directory inside sandbox workspace (defaults to current dir '.') */
  targetDir?: string;
  /** Git commit author name (defaults to 'Orion Agent') */
  gitAuthorName?: string;
  /** Git commit author email (defaults to GitHub App bot email if configured, or 'agent@orion.dev') */
  gitAuthorEmail?: string;
}

export interface CloneRepoResult {
  success: boolean;
  output: string;
}

/**
 * Lists all repositories that the GitHub App installation has access to.
 */
export async function listInstallationRepos(
  token: string,
  options: ListReposOptions = {},
): Promise<GitHubRepository[]> {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(/\/+$/, '');

  const res = await fetchFn(`${baseUrl}/installation/repositories`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list installation repositories (HTTP ${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    repositories?: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      html_url: string;
      clone_url: string;
      default_branch: string;
    }>;
  };

  return (data.repositories ?? []).map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    defaultBranch: repo.default_branch,
  }));
}

/**
 * Clones a repository into the sandbox using the temporary installation token.
 * GitHub supports git over HTTPS with `x-access-token:<token>` authentication.
 */
export async function cloneRepoToSandbox(
  sandbox: SandboxClient,
  repoFullName: string,
  token: string,
  options: CloneRepoOptions = {},
): Promise<CloneRepoResult> {
  const targetDir = options.targetDir ?? '.';
  const cloneUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`;
  const cloneCmd = `git clone ${cloneUrl} ${targetDir}`;

  const rawOutput = await sandbox.runCommand(cloneCmd);
  // Redact token so it never appears in output, logs, or error messages
  const output = rawOutput.replaceAll(token, '***');

  if (output.includes('[exit code') || output.startsWith('Error:')) {
    return { success: false, output };
  }

  // Configure commit author details so the agent can commit cleanly
  const authorName = options.gitAuthorName ?? process.env.GIT_AUTHOR_NAME ?? 'Orion Agent';
  const botId = process.env.GITHUB_BOT_USER_ID ?? '344046298';
  const botSlug = process.env.GITHUB_APP_SLUG ?? 'orion-coding-agent';
  const authorEmail =
    options.gitAuthorEmail ??
    process.env.GIT_AUTHOR_EMAIL ??
    (process.env.GITHUB_APP_ID
      ? `${botId}+${botSlug}[bot]@users.noreply.github.com`
      : 'agent@orion.dev');

  await sandbox.runCommand(`git config user.name "${authorName}"`);
  await sandbox.runCommand(`git config user.email "${authorEmail}"`);

  return { success: true, output };
}
