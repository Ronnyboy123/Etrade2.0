import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  RECOVERY_PATH,
  getRecoveryRedirectUrl,
  isPasswordRecoveryPath,
  friendlyRecoveryError,
  RECOVERY_COOLDOWN_MS,
  recoveryCooldownRemaining
} from '../src/lib/passwordRecovery.js';

test('password recovery uses a dedicated reset-password route', () => {
  assert.equal(RECOVERY_PATH, '/reset-password');
  assert.equal(isPasswordRecoveryPath('/reset-password'), true);
  assert.equal(isPasswordRecoveryPath('/reset-password/'), true);
  assert.equal(isPasswordRecoveryPath('/'), false);
  assert.equal(getRecoveryRedirectUrl('https://relora.example.com'), 'https://relora.example.com/reset-password');
});

test('rate-limit errors are translated into a helpful recovery message', () => {
  assert.equal(
    friendlyRecoveryError({ message: 'email rate limit exceeded' }),
    'Too many password emails were requested. Please wait before trying again and check your inbox for the most recent email.'
  );
  assert.equal(friendlyRecoveryError({ message: 'Something else failed' }), 'Something else failed');
});



test('recovery email cooldown prevents accidental repeat sends', () => {
  assert.equal(RECOVERY_COOLDOWN_MS, 60_000);
  assert.equal(recoveryCooldownRemaining(100_000, 100_000), 60_000);
  assert.equal(recoveryCooldownRemaining(100_000, 130_000), 30_000);
  assert.equal(recoveryCooldownRemaining(100_000, 160_001), 0);
});

test('AuthGate keeps reset-password route in recovery mode even when a session already exists', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /isPasswordRecoveryPath\(window\.location\.pathname\)/);
  assert.match(source, /status:\s*['"]password-recovery['"]/);
  assert.match(source, /getRecoveryRedirectUrl\(window\.location\.origin\)/);
  assert.doesNotMatch(source, /redirectTo:\s*`\$\{window\.location\.origin\}\/`/);
});



test('forgot-password send button is temporarily disabled after a request attempt', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /recoveryCooldownUntil/);
  assert.match(source, /setRecoveryCooldownUntil/);
  assert.match(source, /disabled=\{busy \|\| recoveryCooldownUntil > Date\.now\(\)\}/);
});

test('successful password recovery removes reset route before normal app session resolution', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /history\.replaceState\([^)]*,\s*['"]['"],\s*['"]\/['"]\)/);
});

test('Netlify redirects SPA routes to index so reset-password opens directly', () => {
  const config = fs.readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(config, /\[\[redirects\]\]/);
  assert.match(config, /from\s*=\s*["']\/\*["']/);
  assert.match(config, /to\s*=\s*["']\/index\.html["']/);
  assert.match(config, /status\s*=\s*200/);
});
