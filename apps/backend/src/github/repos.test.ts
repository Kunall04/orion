import { describe, expect, it } from 'vitest';
import { SandboxClient } from '../sandbox/client';
import { cloneRepoToSandbox, listInstallationRepos } from './repos';

describe('GitHub Repositories', () => {
  const mockToken = 'ghs_mockInstallationToken12345';

  describe('listInstallationRepos', () => {
    it('queries GitHub API and returns parsed repositories', async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        expect(url).toBe('https://api.github.com/installation/repositories');
        expect(init?.method).toBe('GET');
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${mockToken}`);
        expect(headers.Accept).toBe('application/vnd.github+json');

        return new Response(
          JSON.stringify({
            total_count: 2,
            repositories: [
              {
                id: 101,
                name: 'calc-app',
                full_name: 'testuser/calc-app',
                private: true,
                html_url: 'https://github.com/testuser/calc-app',
                clone_url: 'https://github.com/testuser/calc-app.git',
                default_branch: 'main',
              },
              {
                id: 102,
                name: 'docs',
                full_name: 'testuser/docs',
                private: false,
                html_url: 'https://github.com/testuser/docs',
                clone_url: 'https://github.com/testuser/docs.git',
                default_branch: 'master',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const repos = await listInstallationRepos(mockToken, { fetch: mockFetch });

      expect(repos).toHaveLength(2);
      expect(repos[0]).toEqual({
        id: 101,
        name: 'calc-app',
        fullName: 'testuser/calc-app',
        private: true,
        htmlUrl: 'https://github.com/testuser/calc-app',
        cloneUrl: 'https://github.com/testuser/calc-app.git',
        defaultBranch: 'main',
      });
      expect(repos[1]).toEqual({
        id: 102,
        name: 'docs',
        fullName: 'testuser/docs',
        private: false,
        htmlUrl: 'https://github.com/testuser/docs',
        cloneUrl: 'https://github.com/testuser/docs.git',
        defaultBranch: 'master',
      });
    });

    it('throws with HTTP status and body on failure', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ message: 'Bad credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await expect(
        listInstallationRepos(mockToken, { fetch: mockFetch }),
      ).rejects.toThrow('Failed to list installation repositories (HTTP 401)');
    });
  });

  describe('cloneRepoToSandbox', () => {
    it('runs git clone with x-access-token, configures git user, and redacts token', async () => {
      const commandsRun: string[] = [];
      const sandbox = new SandboxClient({
        baseUrl: 'http://127.0.0.1:5000',
        fetch: async (_url, init) => {
          const body = JSON.parse((init?.body as string) || '{}');
          commandsRun.push(body.command);
          return new Response(
            JSON.stringify({
              output: `Cloning into '.'...\nToken is ${mockToken}\nDone.`,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        },
      });

      const result = await cloneRepoToSandbox(sandbox, 'testuser/calc-app', mockToken);

      expect(result.success).toBe(true);
      // Ensure the secret token is never in the returned output
      expect(result.output).not.toContain(mockToken);
      expect(result.output).toContain('Token is ***');

      // Verify sequence of commands sent to sandbox
      expect(commandsRun).toEqual([
        `git clone https://x-access-token:${mockToken}@github.com/testuser/calc-app.git .`,
        'git config user.name "Orion Agent"',
        'git config user.email "agent@orion.dev"',
      ]);
    });

    it('returns success: false without running git config if git clone fails', async () => {
      const commandsRun: string[] = [];
      const sandbox = new SandboxClient({
        baseUrl: 'http://127.0.0.1:5000',
        fetch: async (_url, init) => {
          const body = JSON.parse((init?.body as string) || '{}');
          commandsRun.push(body.command);
          return new Response(
            JSON.stringify({
              output: `fatal: repository 'https://x-access-token:${mockToken}@github.com/testuser/calc-app.git' not found\n[exit code 128]`,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        },
      });

      const result = await cloneRepoToSandbox(sandbox, 'testuser/calc-app', mockToken);

      expect(result.success).toBe(false);
      expect(result.output).not.toContain(mockToken);
      expect(result.output).toContain('https://x-access-token:***@github.com');
      expect(result.output).toContain('[exit code 128]');
      // git config should NOT have been called
      expect(commandsRun).toHaveLength(1);
    });
  });
});
