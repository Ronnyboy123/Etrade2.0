import { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck, TriangleAlert } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { profileToAppUser, resolveProfileAccess } from '../lib/auth.js';

function AuthFrame({ children }) {
  return (
    <div className="auth-screen">
      <div className="auth-brand-panel">
        <div className="auth-brand-mark">ST</div>
        <div>
          <div className="auth-eyebrow">CUSTOMS BROKERAGE OPERATIONS</div>
          <h1>Shipment Timeline</h1>
          <p>Secure team workspaces, shipment monitoring, and management reporting in one place.</p>
        </div>
        <div className="auth-security-note"><ShieldCheck size={17} /> Access is restricted to approved company users.</div>
      </div>
      <div className="auth-form-panel">{children}</div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [state, setState] = useState({ status: 'checking', email: '', message: '' });

  const resolveSession = useCallback(async (session) => {
    if (!session?.user) {
      setState({ status: 'signed-out', email: '', message: '' });
      return;
    }

    const email = session.user.email || '';
    setState({ status: 'checking', email, message: '' });

    try {
      // This allows an already-authenticated Google user to be admitted later
      // after management adds their email to approved_users.
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
          email,
          message: access.reason === 'inactive'
            ? 'Your company access is currently inactive.'
            : 'This Google account is not on the approved user list.'
        });
        return;
      }

      setState({
        status: 'authenticated',
        email,
        message: '',
        authUser: session.user,
        currentUser: profileToAppUser(profile)
      });
    } catch (error) {
      setState({
        status: 'error',
        email,
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
      // Run the database lookup outside the auth callback itself.
      window.setTimeout(() => {
        if (active) void resolveSession(session);
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [resolveSession]);

  async function signInWithGoogle() {
    if (!supabase) return;
    setState((old) => ({ ...old, status: 'checking', message: '' }));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) setState({ status: 'error', email: '', message: error.message });
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
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
          <button className="google-login-button secondary-auth-button" onClick={signOut}>Use another Google account</button>
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
          <button className="google-login-button" onClick={signOut}>Return to sign in</button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="auth-lock-icon"><LockKeyhole size={24} /></div>
        <div className="auth-eyebrow dark">SECURE SIGN IN</div>
        <h2>Welcome back</h2>
        <p>Sign in with the Google account approved by your company.</p>
        <button className="google-login-button" onClick={signInWithGoogle}>
          <span className="google-g">G</span>
          Continue with Google
        </button>
        <small className="auth-footnote">Your role and workspace access are controlled by the company allow-list.</small>
      </div>
    </AuthFrame>
  );
}
