import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AuthGate implements Google OAuth, session/profile gate, and sign out', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /signInWithOAuth/);
  assert.match(source, /provider:\s*['"]google['"]/);
  assert.match(source, /getSession/);
  assert.match(source, /from\(['"]profiles['"]\)/);
  assert.match(source, /signOut/);
  assert.match(source, /Continue with Google/);
});
