/**
 * GitHub Authentication — minting short-lived tokens for the sandbox.
 *
 * Flow:
 * 1. createAppJwt: signs a 10-minute JWT using the GitHub App's private key.
 * 2. mintInstallationToken: trades that JWT with GitHub's API for a 1-hour
 *    installation access token (ghs_...).
 *
 * The sandbox only ever receives the short-lived installation token,
 * never the App's private key.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads the GitHub App private key from GITHUB_PRIVATE_KEY or from
 * a file path specified in GITHUB_PRIVATE_KEY_PATH.
 */
export function loadGitHubPrivateKey(
  env: Record<string, string | undefined> = process.env,
  baseDir: string = process.cwd(),
): string | undefined {
  if (env.GITHUB_PRIVATE_KEY) {
    return env.GITHUB_PRIVATE_KEY;
  }
  if (env.GITHUB_PRIVATE_KEY_PATH) {
    const candidates = [
      path.isAbsolute(env.GITHUB_PRIVATE_KEY_PATH)
        ? env.GITHUB_PRIVATE_KEY_PATH
        : path.resolve(baseDir, env.GITHUB_PRIVATE_KEY_PATH),
      path.resolve(baseDir, 'apps/backend', env.GITHUB_PRIVATE_KEY_PATH),
      path.resolve(__dirname, '..', '..', env.GITHUB_PRIVATE_KEY_PATH),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        return fs.readFileSync(cand, 'utf8');
      }
    }
  }
  return undefined;
}

export interface MintTokenOptions {
  /** Optional custom fetch implementation (useful for tests or mocking) */
  fetch?: typeof fetch;
  /** Optional custom GitHub API base URL (default: https://api.github.com) */
  baseUrl?: string;
}

export interface InstallationTokenResponse {
  token: string;
  expiresAt: string;
  permissions?: Record<string, string>;
  repositorySelection?: 'all' | 'selected';
}

/**
 * Creates a 10-minute JWT signed with the GitHub App's private key.
 * Used to authenticate as the GitHub App when calling GitHub's API.
 */
export function createAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');

  const payload = Buffer.from(
    JSON.stringify({
      iss: appId,
      iat: now - 60, // 60s buffer for server clock drift
      exp: now + 10 * 60, // 10 minutes expiration (maximum allowed by GitHub)
    }),
  ).toString('base64url');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKeyPem, 'base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Exchanges a GitHub App JWT for a 1-hour installation access token.
 * This temporary token is what we give to the Docker sandbox to clone and push code.
 */
export async function mintInstallationToken(
  installationId: string,
  jwt: string,
  options: MintTokenOptions = {},
): Promise<InstallationTokenResponse> {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(/\/+$/, '');

  const res = await fetchFn(`${baseUrl}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to mint installation token (HTTP ${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    token: string;
    expires_at: string;
    permissions?: Record<string, string>;
    repository_selection?: 'all' | 'selected';
  };

  return {
    token: data.token,
    expiresAt: data.expires_at,
    permissions: data.permissions,
    repositorySelection: data.repository_selection,
  };
}
