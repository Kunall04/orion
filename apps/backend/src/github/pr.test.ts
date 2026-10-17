import { describe, expect, it } from 'vitest';
import { createPullRequest } from './pr';
import { createPullRequestTool, registerGitHubTools } from '../tools/github';
import { ToolRegistry } from '../tools/registry';

describe('GitHub Pull Requests', () => {
  const mockToken = 'ghs_mockInstallationToken12345';

  describe('createPullRequest', () => {
    it('sends POST /repos/{owner}/{repo}/pulls with correct payload and headers', async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        expect(url).toBe('https://api.github.com/repos/testuser/calc-app/pulls');
        expect(init?.method).toBe('POST');

        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${mockToken}`);
        expect(headers.Accept).toBe('application/vnd.github+json');
        expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
        expect(headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(init?.body as string);
        expect(body).toEqual({
          title: 'Fix precision issue in calculator',
          head: 'fix/precision-bug',
          base: 'main',
          body: 'Fixed floating point error in add function.',
          draft: false,
        });

        return new Response(
          JSON.stringify({
            id: 999,
            number: 42,
            html_url: 'https://github.com/testuser/calc-app/pull/42',
            state: 'open',
            title: 'Fix precision issue in calculator',
            head: { ref: 'fix/precision-bug' },
            base: { ref: 'main' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const result = await createPullRequest(
        mockToken,
        {
          owner: 'testuser',
          repo: 'calc-app',
          title: 'Fix precision issue in calculator',
          head: 'fix/precision-bug',
          base: 'main',
          body: 'Fixed floating point error in add function.',
        },
        { fetch: mockFetch },
      );

      expect(result).toEqual({
        id: 999,
        number: 42,
        htmlUrl: 'https://github.com/testuser/calc-app/pull/42',
        state: 'open',
        title: 'Fix precision issue in calculator',
        head: 'fix/precision-bug',
        base: 'main',
      });
    });

    it('throws with HTTP status and body when GitHub rejects the request', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            message: 'Validation Failed',
            errors: [{ message: 'No commits between main and fix/precision-bug' }],
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        );
      };

      await expect(
        createPullRequest(
          mockToken,
          {
            owner: 'testuser',
            repo: 'calc-app',
            title: 'Noop PR',
            head: 'fix/precision-bug',
            base: 'main',
          },
          { fetch: mockFetch },
        ),
      ).rejects.toThrow('Failed to create pull request (HTTP 422)');
    });
  });

  describe('create_pull_request tool in ToolRegistry', () => {
    it('executes successfully via registry with string token', async () => {
      const registry = new ToolRegistry();
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            id: 1001,
            number: 10,
            html_url: 'https://github.com/octocat/Hello-World/pull/10',
            state: 'open',
            title: 'Add README badge',
            head: { ref: 'feature/badge' },
            base: { ref: 'main' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      };

      registerGitHubTools(registry, mockToken, { fetch: mockFetch });

      const output = await registry.execute(
        'create_pull_request',
        {
          owner: 'octocat',
          repo: 'Hello-World',
          title: 'Add README badge',
          head: 'feature/badge',
          base: 'main',
          body: 'Adds CI status badge.',
        },
        { cwd: '/workspace' },
      );

      expect(output).toContain('Successfully created Pull Request #10');
      expect(output).toContain('https://github.com/octocat/Hello-World/pull/10');
      expect(output).toContain('feature/badge -> main');
    });

    it('supports dynamic async tokenProvider function', async () => {
      const registry = new ToolRegistry();
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            id: 1002,
            number: 11,
            html_url: 'https://github.com/octocat/Hello-World/pull/11',
            state: 'open',
            title: 'Async token PR',
            head: { ref: 'feature/async' },
            base: { ref: 'main' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      };

      let tokenFetched = false;
      const dynamicTokenProvider = async () => {
        tokenFetched = true;
        return 'ghs_dynamicallyFetchedToken';
      };

      registry.register(
        'create_pull_request',
        createPullRequestTool(dynamicTokenProvider, { fetch: mockFetch }),
      );

      const output = await registry.execute(
        'create_pull_request',
        {
          owner: 'octocat',
          repo: 'Hello-World',
          title: 'Async token PR',
          head: 'feature/async',
          base: 'main',
        },
        { cwd: '/workspace' },
      );

      expect(tokenFetched).toBe(true);
      expect(output).toContain('Successfully created Pull Request #11');
    });

    it('rejects invalid arguments via AJV schema before calling API', async () => {
      const registry = new ToolRegistry();
      registerGitHubTools(registry, mockToken);

      // Missing required field 'base'
      const output = await registry.execute(
        'create_pull_request',
        {
          owner: 'octocat',
          repo: 'Hello-World',
          title: 'Missing base',
          head: 'feature/branch',
        },
        { cwd: '/workspace' },
      );

      expect(output).toContain('Error: invalid arguments for "create_pull_request"');
      expect(output).toContain("must have required property 'base'");
    });

    it('returns error string when GitHub API call fails', async () => {
      const registry = new ToolRegistry();
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ message: 'Bad credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      registerGitHubTools(registry, mockToken, { fetch: mockFetch });

      const output = await registry.execute(
        'create_pull_request',
        {
          owner: 'octocat',
          repo: 'Hello-World',
          title: 'Test',
          head: 'feature/test',
          base: 'main',
        },
        { cwd: '/workspace' },
      );

      expect(output).toContain('Error executing tool "create_pull_request"');
      expect(output).toContain('HTTP 401');
    });
  });
});
