import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeRecoveryCode,
  isRecoveryCodeValid,
  friendlyRecoveryVerificationError
} from '../src/lib/passwordRecovery.js';

test('recovery codes accept exactly six numeric digits', () => {
  assert.equal(normalizeRecoveryCode(' 12 34-56 '), '123456');
  assert.equal(normalizeRecoveryCode('abc1234567'), '123456');
  assert.equal(isRecoveryCodeValid('123456'), true);
  assert.equal(isRecoveryCodeValid('12345'), false);
  assert.equal(isRecoveryCodeValid('1234567'), false);
  assert.equal(isRecoveryCodeValid('12a456'), false);
});

test('expired or invalid recovery codes show a friendly verification message', () => {
  assert.equal(
    friendlyRecoveryVerificationError({ message: 'Token has expired or is invalid' }),
    'That recovery code is invalid or has expired. Request one new code and use the most recent email.'
  );
  assert.equal(
    friendlyRecoveryVerificationError({ message: 'otp_expired' }),
    'That recovery code is invalid or has expired. Request one new code and use the most recent email.'
  );
});

test('AuthGate verifies typed recovery code with Supabase recovery OTP before allowing password update', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /status:\s*['"]recovery-code['"]/);
  assert.match(source, /verifyOtp\s*\(\s*\{[\s\S]*email:\s*state\.email[\s\S]*token:\s*recoveryCode[\s\S]*type:\s*['"]recovery['"]/);
  assert.match(source, /Enter 6-digit code/i);
  assert.match(source, /inputMode=['"]numeric['"]/);
  assert.match(source, /maxLength=\{6\}/);
});

test('recovery email flow sends a code rather than depending on a redirect link', () => {
  const source = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  assert.match(source, /resetPasswordForEmail\(targetEmail\)/);
  assert.doesNotMatch(source, /resetPasswordForEmail\(targetEmail,\s*\{\s*redirectTo:/);
  assert.match(source, /We sent a 6-digit recovery code/i);
});

test('README documents the required Supabase recovery email token template', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /\{\{\s*\.Token\s*\}\}/);
  assert.match(readme, /6-digit recovery code/i);
  assert.match(readme, /Authentication\s*→\s*Email Templates/i);
});

test('artifact includes a copy-paste Supabase reset-password email template that uses Token instead of ConfirmationURL', () => {
  const template = fs.readFileSync(new URL('../supabase-recovery-email-template.html', import.meta.url), 'utf8');
  assert.match(template, /\{\{\s*\.Token\s*\}\}/);
  assert.doesNotMatch(template, /\.ConfirmationURL/);
  assert.match(template, /Relora/i);
});
