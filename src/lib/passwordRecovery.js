export const RECOVERY_PATH = '/reset-password';
export const RECOVERY_COOLDOWN_MS = 60_000;

export function isPasswordRecoveryPath(pathname = '') {
  const normalized = String(pathname || '').replace(/\/+$/, '') || '/';
  return normalized === RECOVERY_PATH;
}

export function getRecoveryRedirectUrl(origin) {
  return `${String(origin || '').replace(/\/$/, '')}${RECOVERY_PATH}`;
}

export function recoveryCooldownRemaining(lastRequestedAt, now = Date.now()) {
  if (!Number.isFinite(lastRequestedAt) || lastRequestedAt <= 0) return 0;
  return Math.max(0, RECOVERY_COOLDOWN_MS - Math.max(0, now - lastRequestedAt));
}

export function normalizeRecoveryCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

export function isRecoveryCodeValid(value) {
  return /^\d{6}$/.test(String(value || ''));
}

export function friendlyRecoveryError(error) {
  const message = String(error?.message || error || '').trim();
  if (/rate\s*limit|too\s*many.*email/i.test(message)) {
    return 'Too many password emails were requested. Please wait before trying again and check your inbox for the most recent email.';
  }
  return message || 'Unable to send the password email right now.';
}

export function friendlyRecoveryVerificationError(error) {
  const message = String(error?.message || error || '').trim();
  if (/otp[_\s-]*expired|token.*expired|expired.*token|invalid.*token|token.*invalid|invalid.*otp|otp.*invalid/i.test(message)) {
    return 'That recovery code is invalid or has expired. Request one new code and use the most recent email.';
  }
  if (/rate\s*limit|too\s*many/i.test(message)) {
    return 'Too many verification attempts were made. Please wait before trying again.';
  }
  return message || 'Unable to verify that recovery code right now.';
}
