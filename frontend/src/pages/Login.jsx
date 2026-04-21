import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('login'); // 'login' | 'forgot'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [forgotUsername, setForgotUsername] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername.trim() || undefined }),
      });
      await r.json();
      setInfo('If that account exists, a reset link has been sent to omribor1@gmail.com');
    } catch {
      setInfo('If that account exists, a reset link has been sent to omribor1@gmail.com');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={{ fontSize: 32 }}>⚽</span>
          <h1 style={styles.title}>Game Profitability</h1>
          <p style={styles.subtitle}>Dashboard</p>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />

            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && <p style={styles.error}>{error}</p>}

            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <button
              type="button"
              style={styles.linkBtn}
              onClick={() => { setTab('forgot'); setError(''); }}
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot} style={styles.form}>
            <p style={styles.forgotDesc}>
              Enter your username (or leave blank) and we'll send a reset link to omribor1@gmail.com
            </p>
            <label style={styles.label}>Username (optional)</label>
            <input
              style={styles.input}
              type="text"
              value={forgotUsername}
              onChange={e => setForgotUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />

            {error && <p style={styles.error}>{error}</p>}
            {info && <p style={styles.success}>{info}</p>}

            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              style={styles.linkBtn}
              onClick={() => { setTab('login'); setError(''); setInfo(''); }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f1117',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    background: '#1a1d27',
    border: '1px solid #2a2d3a',
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  logo: {
    textAlign: 'center',
    marginBottom: 32,
  },
  title: {
    margin: '8px 0 4px',
    fontSize: 20,
    fontWeight: 700,
    color: '#e2e8f0',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    color: '#64748b',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: '#94a3b8',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    background: '#0f1117',
    border: '1px solid #2a2d3a',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#e2e8f0',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  btn: {
    marginTop: 24,
    padding: '11px 20px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  linkBtn: {
    marginTop: 14,
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
    alignSelf: 'center',
  },
  error: {
    marginTop: 12,
    color: '#f87171',
    fontSize: 13,
    background: 'rgba(248,113,113,0.1)',
    padding: '8px 12px',
    borderRadius: 6,
  },
  success: {
    marginTop: 12,
    color: '#4ade80',
    fontSize: 13,
    background: 'rgba(74,222,128,0.1)',
    padding: '8px 12px',
    borderRadius: 6,
  },
  forgotDesc: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 0,
    marginBottom: 4,
    lineHeight: 1.5,
  },
};
