import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters');
    if (newPassword !== confirm) return setError('Passwords do not match');

    setLoading(true);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await r.json();
      if (!r.ok) return setError(data.error || 'Reset failed');
      setSuccess(true);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#f87171', textAlign: 'center' }}>
            Invalid reset link. Please request a new one.
          </p>
          <button style={styles.btn} onClick={() => navigate('/login')}>Back to Login</button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <span style={{ fontSize: 32 }}>✅</span>
            <h1 style={styles.title}>Password Updated</h1>
          </div>
          <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>
            Your password has been updated. You can now sign in.
          </p>
          <button style={{ ...styles.btn, marginTop: 24 }} onClick={() => navigate('/login')}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={{ fontSize: 32 }}>🔑</span>
          <h1 style={styles.title}>Set New Password</h1>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>New Password</label>
          <input
            style={styles.input}
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoFocus
            required
            minLength={8}
            autoComplete="new-password"
          />

          <label style={styles.label}>Confirm Password</label>
          <input
            style={styles.input}
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
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
    margin: '8px 0 0',
    fontSize: 20,
    fontWeight: 700,
    color: '#e2e8f0',
    letterSpacing: '-0.3px',
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
    width: '100%',
  },
  error: {
    marginTop: 12,
    color: '#f87171',
    fontSize: 13,
    background: 'rgba(248,113,113,0.1)',
    padding: '8px 12px',
    borderRadius: 6,
  },
};
