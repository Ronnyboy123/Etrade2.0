import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, Mail, ShieldCheck, TriangleAlert } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { profileToAppUser, resolveProfileAccess } from '../lib/auth.js';

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

function PasswordField({ value, onChange }) {
  return (
    <label className="auth-field">
      <span>Password</span>
      <div className="auth-input-wrap">
        <KeyRound size={17} />
        <input
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
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
  const [busy, setBusy] = useState(false);

  const resolveSession = useCallback(async (session) => {
    if (!session?.user) {
      setState((old) => ({ status: 'signed-out', email: old.email || '', message: '' }));
      return;
    }

    const sessionEmail = session.user.email || '';
    setState({ status: 'checking', email: sessionEmail, message: '' });

    try {
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
      void resolveSession(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (!active) return;
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

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPassword('');
    setState({ status: 'signed-out', email: '', message: '' });
  }

  if (state.status === 'authenticated') {
    return children({ currentUser: state.currentUser, authUser: state.authUser, signOut });
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
        <p>Sign in with the email and password provided for your approved Relora account.</p>
        <label className="auth-field">
          <span>Email</span>
          <div className="auth-input-wrap"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
        </label>
        <PasswordField value={password} onChange={setPassword} />
        {state.message && <div className="auth-message error">{state.message}</div>}
        <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <small className="auth-footnote">Your role and workspace access are controlled by the company allow-list.</small>
      </form>
    </AuthFrame>
  );
}
