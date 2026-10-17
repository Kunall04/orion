/**
 * GitHub Connection Test Script.
 *
 * Verifies that the GitHub App credentials in `.env` are working against real GitHub:
 * 1. Loads GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and the private key (.pem).
 * 2. Signs a real 10-minute JWT.
 * 3. Exchanges the JWT with GitHub API for a real 1-hour installation token (ghs_...).
 * 4. Lists the repositories this App has permission to access.
 *
 * Run with:
 *   npx tsx --env-file=apps/backend/.env apps/backend/src/github/test-connection.ts
 */

import { createAppJwt, loadGitHubPrivateKey, mintInstallationToken } from './auth';
import { listInstallationRepos } from './repos';

async function main() {
  console.log('🔍 Testing GitHub App credentials with real GitHub API...\n');

  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = loadGitHubPrivateKey(process.env, process.cwd());

  if (!appId) {
    console.error('❌ GITHUB_APP_ID is missing in .env');
    process.exit(1);
  }

  if (!installationId) {
    console.error('❌ GITHUB_INSTALLATION_ID is missing in .env');
    process.exit(1);
  }

  if (!privateKey) {
    console.error(
      '❌ Could not load private key. Ensure GITHUB_PRIVATE_KEY_PATH points to a valid .pem file or GITHUB_PRIVATE_KEY is set in .env',
    );
    process.exit(1);
  }

  console.log(`✅ App ID: ${appId}`);
  console.log(`✅ Installation ID: ${installationId}`);
  console.log('✅ Private Key: Loaded successfully from PEM');

  console.log('\n🔐 1. Signing 10-minute JWT using private key...');
  const jwt = createAppJwt(appId, privateKey);
  console.log('   JWT created successfully.');

  console.log('\n🎟️  2. Exchanging JWT for a 1-hour installation token from GitHub...');
  const tokenRes = await mintInstallationToken(installationId, jwt);
  console.log(
    `   Token minted! Expires at: ${tokenRes.expiresAt} (format: ${tokenRes.token.slice(0, 8)}***)`,
  );

  console.log('\n📚 3. Querying accessible repositories from GitHub API...');
  const repos = await listInstallationRepos(tokenRes.token);

  if (repos.length === 0) {
    console.log('   App has 0 repositories selected. (Check your App installation settings)');
  } else {
    console.log(`   Found ${repos.length} accessible repository(ies):`);
    for (const repo of repos) {
      console.log(`   • ${repo.fullName} (${repo.private ? 'private' : 'public'}) [${repo.htmlUrl}]`);
    }
  }

  console.log('\n🎉 ALL REAL GITHUB CHECKS PASSED! Orion is fully connected to your GitHub!');
}

main().catch((err) => {
  console.error('\n❌ Connection failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
