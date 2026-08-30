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

test('forgot password and recovery flow use Supabase email recovery APIs', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /resetPasswordForEmail/);
  assert.match(source, /PASSWORD_RECOVERY/);
  assert.match(source, /updateUser\(\{\s*password/);
  assert.match(source, /Forgot password/i);
  assert.match(source, /Set new password/i);
});

test('authenticated app receives an action that sends password change email', () => {
  const auth = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(auth, /requestPasswordChange/);
  assert.match(app, /requestPasswordChange/);
  assert.match(app, /Password/);
});
