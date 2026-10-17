import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAppJwt, mintInstallationToken } from './auth';

describe('GitHub Auth', () => {
  let privateKey: string;
  let publicKey: string;
  const appId = '123456';
  const installationId = '987654';

  beforeAll(() => {
    // Generate a real temporary 2048-bit RSA keypair in-memory for testing
    const pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  describe('createAppJwt', () => {
    it('creates a 3-part base64url encoded JWT', () => {
      const jwt = createAppJwt(appId, privateKey);
      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);
    });

    it('contains the correct header and payload', () => {
      const jwt = createAppJwt(appId, privateKey);
      const [headerB64, payloadB64] = jwt.split('.') as [string, string, string];

      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

      expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
      expect(payload.iss).toBe(appId);
      expect(payload.exp - payload.iat).toBe(660); // 10 mins (600s) + 60s clock skew
    });

    it('verifies successfully with the matching public key', () => {
      const jwt = createAppJwt(appId, privateKey);
      const [headerB64, payloadB64, signatureB64] = jwt.split('.') as [string, string, string];

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${headerB64}.${payloadB64}`);
      const isValid = verifier.verify(publicKey, signatureB64, 'base64url');

      expect(isValid).toBe(true);
    });

    it('fails verification if the message was tampered with', () => {
      const jwt = createAppJwt(appId, privateKey);
      const [, , signatureB64] = jwt.split('.') as [string, string, string];

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update('tampered.data');
      const isValid = verifier.verify(publicKey, signatureB64, 'base64url');

      expect(isValid).toBe(false);
    });
  });

  describe('mintInstallationToken', () => {
    it('exchanges JWT for an installation token via GitHub API', async () => {
      const mockJwt = 'mock.jwt.token';

      const mockFetch: typeof fetch = async (url, init) => {
        expect(url).toBe(
          `https://api.github.com/app/installations/${installationId}/access_tokens`,
        );
        expect(init?.method).toBe('POST');
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${mockJwt}`);
        expect(headers.Accept).toBe('application/vnd.github+json');

        return new Response(
          JSON.stringify({
            token: 'ghs_mockInstallationToken12345',
            expires_at: '2026-10-17T21:00:00Z',
            permissions: { contents: 'write', pull_requests: 'write' },
            repository_selection: 'selected',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const result = await mintInstallationToken(installationId, mockJwt, { fetch: mockFetch });

      expect(result.token).toBe('ghs_mockInstallationToken12345');
      expect(result.expiresAt).toBe('2026-10-17T21:00:00Z');
      expect(result.permissions).toEqual({ contents: 'write', pull_requests: 'write' });
      expect(result.repositorySelection).toBe('selected');
    });

    it('throws when GitHub returns an error response', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ message: 'Bad credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await expect(
        mintInstallationToken(installationId, 'invalid.jwt', { fetch: mockFetch }),
      ).rejects.toThrow('Failed to mint installation token (HTTP 401)');
    });
  });
});
