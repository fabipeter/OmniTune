import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, library, syncClient } from '../app/services';
import { useSyncUser } from '../hooks/useStore';
import { useUi } from '../app/uiContext';

export function AuthPage() {
  const user = useSyncUser();
  const navigate = useNavigate();
  const { toast } = useUi();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return (
      <div className="settings-wrap">
        <section className="settings-section">
          <h2>Signed in as {user.displayName}</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
            {user.email} · Your library syncs automatically with {API_URL}.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="pill-btn primary"
              onClick={async () => {
                try {
                  const r = await syncClient.sync(library);
                  toast(`Synced (${r.pulled} updates pulled)`);
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Sync failed');
                }
              }}
            >
              Sync library now
            </button>
            <button
              className="pill-btn ghost"
              onClick={async () => {
                await syncClient.logout();
                toast('Signed out');
              }}
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await syncClient.login(email, password);
      else await syncClient.register(email, password, displayName);
      await syncClient.sync(library);
      toast('Signed in & synced!');
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Is apps/server running?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-wrap" style={{ maxWidth: 460 }}>
      <form className="settings-section" onSubmit={submit}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
          {mode === 'login' ? 'Sign in to OmniTune' : 'Create an OmniTune account'}
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>
          Optional — guest mode already saves everything locally. Sign in to sync playlists, likes, history and settings across Web, Desktop, iOS and Android.
        </p>

        {mode === 'register' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            Display name
            <input className="text-input" placeholder="Alex" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          Email
          <input className="text-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          Password (8+ characters)
          <input className="text-input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        <button type="submit" className="pill-btn primary" disabled={busy} style={{ justifyContent: 'center', height: 42 }}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'underline' }}
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'));
            setError(null);
          }}
        >
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
