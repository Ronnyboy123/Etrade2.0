import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, LockKeyhole, Mail, ShieldCheck, TriangleAlert } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { profileToAppUser, resolveProfileAccess } from '../lib/auth.js';
import {
  RECOVERY_COOLDOWN_MS,
  friendlyRecoveryError,
  friendlyRecoveryVerificationError,
  isPasswordRecoveryPath,
  isRecoveryCodeValid,
  normalizeRecoveryCode,
  recoveryCooldownRemaining
} from '../lib/passwordRecovery.js';

function AuthFrame({ children }) {
  return (
    <div className="auth-screen">
      <div className="auth-brand-panel">
        <div className="auth-brand-mark">RL</div>
        <div>
          <div className="auth-eyebrow">INTERNAL SHIPMENT & CUSTOMS OPERATIONS</div>
          <h1>Relora</h1>
          <div className="auth-organization"><span>Organization</span><strong>a. hartrodt</strong></div>
          <p>Secure team workspaces, shipment monitoring, and management reporting in one place.</p>
        </div>
        <div className="auth-security-note"><ShieldCheck size={17} /> Access is restricted to approved company users.</div>
      </div>
      <div className="auth-form-panel">{children}</div>
    </div>
  );
}

function PasswordField({ value, onChange, placeholder = 'Password', autoComplete = 'current-password' }) {
  return (
    <label className="auth-field">
      <span>Password</span>
      <div className="auth-input-wrap">
        <KeyRound size={17} />
        <input
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
      </div>
    </label>
  );
}

export default function AuthGate({ children }) {
  const [state, setState] = useState({ status: 'checking', email: '', message: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCooldownUntil, setRecoveryCooldownUntil] = useState(0);
  const recoveryRequestAtRef = useRef(0);

  useEffect(() => {
    if (!recoveryCooldownUntil) return undefined;
    const remaining = recoveryCooldownUntil - Date.now();
    if (remaining <= 0) {
      setRecoveryCooldownUntil(0);
      return undefined;
    }
    const timer = window.setTimeout(() => setRecoveryCooldownUntil(0), remaining);
    return () => window.clearTimeout(timer);
  }, [recoveryCooldownUntil]);

  const resolveSession = useCallback(async (session) => {
    if (!session?.user) {
      setState((old) => ({ status: 'signed-out', email: old.email || '', message: '' }));
      return;
    }

    const sessionEmail = session.user.email || '';
    setState({ status: 'checking', email: sessionEmail, message: '' });

    try {
      // Authentication proves identity. This second gate proves company authorization.
      const { error: claimError } = await supabase.rpc('claim_approved_profile');
      if (claimError) throw claimError;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id,email,full_name,role,declarant_name,team_id,is_active')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) throw error;
      const access = resolveProfileAccess(profile);
      if (!access.allowed) {
        setState({
          status: 'denied',
          email: sessionEmail,
          message: access.reason === 'inactive'
            ? 'Your company access is currently inactive.'
            : 'This email is not on the approved company user list.'
        });
        return;
      }

      setState({
        status: 'authenticated',
        email: sessionEmail,
        message: '',
        authUser: session.user,
        currentUser: profileToAppUser(profile)
      });
    } catch (error) {
      setState({
        status: 'error',
        email: sessionEmail,
        message: error?.message || 'Unable to verify your company access.'
      });
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setState({ status: 'config-missing', email: '', message: '' });
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setState({ status: 'error', email: '', message: error.message });
        return;
      }
      if (isPasswordRecoveryPath(window.location.pathname) && data.session?.user) {
        setNewPassword('');
        setConfirmPassword('');
        setState({ status: 'password-recovery', email: data.session.user.email || '', message: '' });
        return;
      }
      void resolveSession(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (!active) return;
        const recoveryRoute = isPasswordRecoveryPath(window.location.pathname);
        if ((event === 'PASSWORD_RECOVERY' || recoveryRoute) && session?.user) {
          setNewPassword('');
          setConfirmPassword('');
          setState({ status: 'password-recovery', email: session.user.email || '', message: '' });
          return;
        }
        void resolveSession(session);
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [resolveSession]);

  async function signInWithPassword(event) {
    event?.preventDefault?.();
    if (!supabase || busy) return;
    setBusy(true);
    setState((old) => ({ ...old, status: 'signed-out', message: '' }));
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    setBusy(false);
    if (error) {
      setState({ status: 'signed-out', email: email.trim(), message: error.message || 'Incorrect email or password.' });
    }
  }

  async function sendRecoveryEmail(event) {
    event?.preventDefault?.();
    if (!supabase || busy) return;
    const targetEmail = (email || state.email || '').trim().toLowerCase();
    if (!targetEmail) {
      setState((old) => ({ ...old, status: 'forgot-password', message: 'Enter your email address first.' }));
      return;
    }
    const remaining = recoveryCooldownRemaining(recoveryRequestAtRef.current);
    if (remaining > 0) {
      setState((old) => ({
        ...old,
        status: 'forgot-password',
        message: `A password email was just requested. Please wait ${Math.ceil(remaining / 1000)} seconds and check your inbox.`
      }));
      return;
    }

    recoveryRequestAtRef.current = Date.now();
    setRecoveryCooldownUntil(recoveryRequestAtRef.current + RECOVERY_COOLDOWN_MS);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail);
    setBusy(false);
    if (error) {
      setState({ status: 'forgot-password', email: targetEmail, message: friendlyRecoveryError(error) });
      return;
    }
    setEmail(targetEmail);
    setRecoveryCode('');
    setState({ status: 'recovery-code', email: targetEmail, message: '' });
  }

  async function verifyRecoveryCode(event) {
    event?.preventDefault?.();
    if (!supabase || busy) return;
    if (!isRecoveryCodeValid(recoveryCode)) {
      setState((old) => ({ ...old, status: 'recovery-code', message: 'Enter the complete 6-digit recovery code from your email.' }));
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: state.email,
      token: recoveryCode,
      type: 'recovery'
    });
    setBusy(false);
    if (error) {
      setState((old) => ({ ...old, status: 'recovery-code', message: friendlyRecoveryVerificationError(error) }));
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setState((old) => ({ ...old, status: 'password-recovery', message: '' }));
  }

  async function setRecoveredPassword(event) {
    event?.preventDefault?.();
    if (!supabase || busy) return;
    if (newPassword.length < 8) {
      setState((old) => ({ ...old, message: 'Use at least 8 characters for your new password.' }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setState((old) => ({ ...old, message: 'The new passwords do not match.' }));
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setBusy(false);
      setState((old) => ({ ...old, message: error.message }));
      return;
    }
    await supabase.auth.signOut();
    setBusy(false);
    setPassword('');
    setRecoveryCode('');
    window.history.replaceState(null, '', '/');
    setState({
      status: 'signed-out',
      email: state.email || '',
      message: 'Password changed successfully. Sign in with your new password.'
    });
  }

  async function requestPasswordChange() {
    if (!supabase || !state.authUser?.email) throw new Error('No signed-in email is available.');
    const remaining = recoveryCooldownRemaining(recoveryRequestAtRef.current);
    if (remaining > 0) {
      throw new Error(`A password email was just requested. Please wait ${Math.ceil(remaining / 1000)} seconds and check your inbox.`);
    }
    recoveryRequestAtRef.current = Date.now();
    const targetEmail = state.authUser.email.trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail);
    if (error) throw new Error(friendlyRecoveryError(error));
    setEmail(targetEmail);
    setRecoveryCode('');
    setState({ status: 'recovery-code', email: targetEmail, message: '' });
    return `Recovery code sent to ${targetEmail}.`;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPassword('');
    setState({ status: 'signed-out', email: '', message: '' });
  }

  if (state.status === 'authenticated') {
    return children({ currentUser: state.currentUser, authUser: state.authUser, signOut, requestPasswordChange });
  }

  if (state.status === 'checking') {
    return (
      <AuthFrame>
        <div className="auth-card auth-loading-card">
          <div className="auth-spinner" />
          <h2>Checking secure access…</h2>
          <p>{state.email ? `Verifying ${state.email}` : 'Connecting to your workspace.'}</p>
        </div>
      </AuthFrame>
    );
  }

  if (state.status === 'config-missing') {
    return (
      <AuthFrame>
        <div className="auth-card">
          <TriangleAlert className="auth-state-icon warning" size={32} />
          <div className="auth-eyebrow dark">SETUP REQUIRED</div>
          <h2>Connect Supabase first</h2>
          <p>Add your Supabase URL and public key to the local <code>.env</code> file and Netlify environment variables.</p>
          <div className="auth-code-note">VITE_SUPABASE_URL<br />VITE_SUPABASE_PUBLISHABLE_KEY</div>
        </div>
      </AuthFrame>
    );
  }

  if (state.status === 'recovery-code') {
    return (
      <AuthFrame>
        <form className="auth-card" onSubmit={verifyRecoveryCode}>
          <div className="auth-lock-icon"><KeyRound size={24} /></div>
          <div className="auth-eyebrow dark">VERIFY RECOVERY CODE</div>
          <h2>Enter 6-digit code</h2>
          <p>We sent a 6-digit recovery code to <strong>{state.email}</strong>. Use the most recent code from your email.</p>
          <label className="auth-field">
            <span>Recovery code</span>
            <div className="auth-input-wrap">
              <KeyRound size={17} />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(normalizeRecoveryCode(event.target.value))}
                placeholder="123456"
                required
              />
            </div>
          </label>
          {state.message && <div className="auth-message error">{state.message}</div>}
          <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify code'}</button>
          <button
            className="auth-link-button"
            type="button"
            disabled={busy || recoveryCooldownUntil > Date.now()}
            onClick={() => void sendRecoveryEmail()}
          >
            Resend code
          </button>
          <button className="auth-link-button" type="button" onClick={() => { setRecoveryCode(''); setState({ status: 'signed-out', email: state.email, message: '' }); }}>Back to sign in</button>
        </form>
      </AuthFrame>
    );
  }

  if (state.status === 'password-recovery') {
    return (
      <AuthFrame>
        <form className="auth-card" onSubmit={setRecoveredPassword}>
          <div className="auth-lock-icon"><KeyRound size={24} /></div>
          <div className="auth-eyebrow dark">PASSWORD RECOVERY</div>
          <h2>Set new password</h2>
          <p>Create a new password for {state.email || 'your Relora account'}.</p>
          <PasswordField value={newPassword} onChange={setNewPassword} placeholder="New password" autoComplete="new-password" />
          <PasswordField value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm new password" autoComplete="new-password" />
          {state.message && <div className="auth-message error">{state.message}</div>}
          <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Set new password'}</button>
        </form>
      </AuthFrame>
    );
  }

  if (state.status === 'forgot-password') {
    return (
      <AuthFrame>
        <form className="auth-card" onSubmit={sendRecoveryEmail}>
          <div className="auth-lock-icon"><Mail size={24} /></div>
          <div className="auth-eyebrow dark">ACCOUNT RECOVERY</div>
          <h2>Forgot password?</h2>
          <p>Enter your approved Relora email. We'll send a 6-digit recovery code.</p>
          <label className="auth-field">
            <span>Email</span>
            <div className="auth-input-wrap"><Mail size={17} /><input type="email" value={email || state.email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
          </label>
          {state.message && <div className="auth-message error">{state.message}</div>}
          <button className="auth-primary-button" type="submit" disabled={busy || recoveryCooldownUntil > Date.now()}>{busy ? 'Sending…' : 'Send recovery code'}</button>
          <button className="auth-link-button" type="button" onClick={() => setState({ status: 'signed-out', email: '', message: '' })}>Back to sign in</button>
        </form>
      </AuthFrame>
    );
  }


  if (state.status === 'denied') {
    return (
      <AuthFrame>
        <div className="auth-card">
          <LockKeyhole className="auth-state-icon" size={32} />
          <div className="auth-eyebrow dark">ACCESS NOT APPROVED</div>
          <h2>Ask your manager for access</h2>
          <p>{state.message}</p>
          {state.email && <div className="auth-account-chip">{state.email}</div>}
          <button className="auth-primary-button secondary-auth-button" onClick={signOut}>Back to sign in</button>
        </div>
      </AuthFrame>
    );
  }

  if (state.status === 'error') {
    return (
      <AuthFrame>
        <div className="auth-card">
          <TriangleAlert className="auth-state-icon warning" size={32} />
          <div className="auth-eyebrow dark">SIGN-IN ERROR</div>
          <h2>We couldn't verify access</h2>
          <p>{state.message}</p>
          <button className="auth-primary-button" onClick={signOut}>Return to sign in</button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <form className="auth-card" onSubmit={signInWithPassword}>
        <div className="auth-lock-icon"><LockKeyhole size={24} /></div>
        <div className="auth-eyebrow dark">SECURE SIGN IN</div>
        <h2>Welcome back</h2>
        <p>Sign in with the email and password issued for your approved Relora account.</p>
        <label className="auth-field">
          <span>Email</span>
          <div className="auth-input-wrap"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
        </label>
        <PasswordField value={password} onChange={setPassword} />
        {state.message && <div className="auth-message error">{state.message}</div>}
        <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button className="auth-link-button" type="button" onClick={() => setState({ status: 'forgot-password', email, message: '' })}>Forgot password?</button>
        <small className="auth-footnote">Your role and workspace access are controlled by the company allow-list.</small>
      </form>
    </AuthFrame>
  );
}
