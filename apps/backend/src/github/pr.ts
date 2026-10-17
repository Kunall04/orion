/**
 * GitHub Pull Requests — creating real PRs on GitHub.
 *
 * Flow:
 * 1. The agent edits code in the sandbox, commits to a feature branch,
 *    and pushes the branch to GitHub using the temporary installation token.
 * 2. createPullRequest calls GitHub REST API POST /repos/{owner}/{repo}/pulls
 *    with `head` (feature branch) and `base` (e.g. main/master).
 * 3. GitHub returns the created PR metadata (id, number, html_url, state).
 */

export interface CreatePullRequestParams {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface PullRequestResult {
  id: number;
  number: number;
  htmlUrl: string;
  state: string;
  title: string;
  head: string;
  base: string;
}

export interface GitHubApiOptions {
  /** Optional custom fetch implementation (useful for tests or mocking) */
  fetch?: typeof fetch;
  /** Optional custom GitHub API base URL (default: https://api.github.com) */
  baseUrl?: string;
}

/**
 * Creates a Pull Request on GitHub via REST API POST /repos/{owner}/{repo}/pulls.
 */
export async function createPullRequest(
  token: string,
  params: CreatePullRequestParams,
  options: GitHubApiOptions = {},
): Promise<PullRequestResult> {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(/\/+$/, '');

  const { owner, repo, title, head, base, body, draft } = params;

  const res = await fetchFn(`${baseUrl}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      head,
      base,
      body: body ?? '',
      draft: draft ?? false,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to create pull request (HTTP ${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as {
    id: number;
    number: number;
    html_url: string;
    state: string;
    title: string;
    head: { ref: string };
    base: { ref: string };
  };

  return {
    id: data.id,
    number: data.number,
    htmlUrl: data.html_url,
    state: data.state,
    title: data.title,
    head: data.head?.ref ?? head,
    base: data.base?.ref ?? base,
  };
}
