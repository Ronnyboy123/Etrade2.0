import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const authUrl = new URL('../src/components/AuthGate.jsx', import.meta.url);
const appUrl = new URL('../src/App.jsx', import.meta.url);
const readmeUrl = new URL('../README.md', import.meta.url);
const recoveryLibUrl = new URL('../src/lib/passwordRecovery.js', import.meta.url);
const recoveryTemplateUrl = new URL('../supabase-recovery-email-template.html', import.meta.url);
const packageUrl = new URL('../package.json', import.meta.url);

test('v10.4 keeps password sign-in but removes self-service recovery from AuthGate', () => {
  const source = fs.readFileSync(authUrl, 'utf8');
  assert.match(source, /signInWithPassword/);
  assert.match(source, /type=["']email["']/);
  assert.match(source, /type=["']password["']/);
  assert.doesNotMatch(source, /passwordRecovery\.js/);
  assert.doesNotMatch(source, /resetPasswordForEmail/);
  assert.doesNotMatch(source, /verifyOtp/);
  assert.doesNotMatch(source, /PASSWORD_RECOVERY/);
  assert.doesNotMatch(source, /Forgot password/i);
  assert.doesNotMatch(source, /Set new password/i);
  assert.doesNotMatch(source, /recovery-code/);
});

test('v10.4 removes the signed-in password email action', () => {
  const auth = fs.readFileSync(authUrl, 'utf8');
  const app = fs.readFileSync(appUrl, 'utf8');
  assert.doesNotMatch(auth, /requestPasswordChange/);
  assert.doesNotMatch(app, /requestPasswordChange/);
  assert.doesNotMatch(app, /className=["']password-button["']/);
});

test('v10.4 removes obsolete recovery-only files and documents admin-provisioned passwords', () => {
  assert.equal(fs.existsSync(recoveryLibUrl), false);
  assert.equal(fs.existsSync(recoveryTemplateUrl), false);
  const readme = fs.readFileSync(readmeUrl, 'utf8');
  assert.match(readme, /password.*provided|provided.*password|temporary password/i);
  assert.doesNotMatch(readme, /6-digit recovery code/i);
  assert.doesNotMatch(readme, /\{\{\s*\.Token\s*\}\}/);
});

test('package version identifies current Relora v11.3', () => {
  const pkg = JSON.parse(fs.readFileSync(packageUrl, 'utf8'));
  assert.equal(pkg.version, '1.1.3');
});
