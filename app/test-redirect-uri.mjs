/**
 * Test that DISCORD_OAUTH_REDIRECT_URI is used correctly
 * This verifies that the callback URL comes from env, not from request origin
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Read the login.ts file
const loginCode = readFileSync('functions/api/auth/discord/login.ts', 'utf-8');
const callbackCode = readFileSync('functions/api/auth/discord/callback.ts', 'utf-8');

console.log('✓ Testing DISCORD_OAUTH_REDIRECT_URI usage...\n');

// Check 1: login.ts should NOT construct redirectUri from request
if (loginCode.includes('new URL(req.url).origin')) {
  console.log('✗ FAIL: login.ts still constructs redirectUri from request origin');
  process.exit(1);
} else {
  console.log('✓ PASS: login.ts does NOT construct redirectUri from request origin');
}

// Check 2: login.ts should use env.DISCORD_OAUTH_REDIRECT_URI
if (loginCode.includes('env.DISCORD_OAUTH_REDIRECT_URI')) {
  console.log('✓ PASS: login.ts uses env.DISCORD_OAUTH_REDIRECT_URI');
} else {
  console.log('✗ FAIL: login.ts does NOT use env.DISCORD_OAUTH_REDIRECT_URI');
  process.exit(1);
}

// Check 3: callback.ts should NOT construct redirectUri from request
if (callbackCode.includes('new URL(req.url).origin')) {
  console.log('✗ FAIL: callback.ts still constructs redirectUri from request origin');
  process.exit(1);
} else {
  console.log('✓ PASS: callback.ts does NOT construct redirectUri from request origin');
}

// Check 4: callback.ts should use env.DISCORD_OAUTH_REDIRECT_URI
if (callbackCode.includes('env.DISCORD_OAUTH_REDIRECT_URI')) {
  console.log('✓ PASS: callback.ts uses env.DISCORD_OAUTH_REDIRECT_URI');
} else {
  console.log('✗ FAIL: callback.ts does NOT use env.DISCORD_OAUTH_REDIRECT_URI');
  process.exit(1);
}

// Check 5: types.ts should have DISCORD_OAUTH_REDIRECT_URI in CloudflareEnv
const typesCode = readFileSync('functions/api/auth/types.ts', 'utf-8');
if (typesCode.includes('DISCORD_OAUTH_REDIRECT_URI: string')) {
  console.log('✓ PASS: CloudflareEnv includes DISCORD_OAUTH_REDIRECT_URI');
} else {
  console.log('✗ FAIL: CloudflareEnv does NOT include DISCORD_OAUTH_REDIRECT_URI');
  process.exit(1);
}

// Check 6: .env.local should have the local redirect URI
const envLocal = readFileSync('.env.local', 'utf-8');
if (envLocal.includes('DISCORD_OAUTH_REDIRECT_URI=http://127.0.0.1:8788/api/auth/discord/callback')) {
  console.log('✓ PASS: .env.local has correct local redirect URI');
} else {
  console.log('✗ FAIL: .env.local missing or incorrect redirect URI');
  process.exit(1);
}

console.log('\n✅ All checks PASSED: DISCORD_OAUTH_REDIRECT_URI is properly configured');
console.log('\nConfiguration:');
console.log('  - Callback URL now comes from env, not request origin');
console.log('  - Local: http://127.0.0.1:8788/api/auth/discord/callback');
console.log('  - Staging: https://feature-phase2a-oauth--lords-academy.pages.dev/api/auth/discord/callback');
console.log('  - Production: https://lords-academy.pages.dev/api/auth/discord/callback');
console.log('\nNext: Configure this variable in Cloudflare Pages Dashboard for each environment');
