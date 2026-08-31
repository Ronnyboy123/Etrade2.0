import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Relora v10 uses email/password login instead of Google OAuth', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /signInWithPassword/);
  assert.match(source, /type=["']email["']/);
  assert.match(source, /type=["']password["']/);
  assert.doesNotMatch(source, /signInWithOAuth/);
  assert.doesNotMatch(source, /provider:\s*['"]google['"]/);
  assert.doesNotMatch(source, /Continue with Google/);
});

test('Relora v10.4 has no self-service password recovery action', () => {
  const auth = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(auth, /resetPasswordForEmail|verifyOtp|PASSWORD_RECOVERY|Forgot password/i);
  assert.doesNotMatch(app, /requestPasswordChange|password-button/);
});
