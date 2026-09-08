import { useEffect, useState } from 'react';

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}
const r2 = n => Math.round(n * 100) / 100;

export default function Eli() {
  const [games, setGames] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    fetch('/api/games')
      .then(r => r.json())
      .then(d => setGames((d.games || []).filter(g => (g.eli_cost || 0) > 0)))
      .catch(e => setError(e.message));
  };
  useEffect(load, []);

  if (error) return <div className="page"><div className="error-box">Error: {error}</div></div>;
  if (games == null) return <div className="loading">Loading…</div>;

  // Debt = cost still not paid. Sort by game date, newest first (undated last).
  const rows = games
    .map(g => ({ ...g, owed: r2((g.eli_cost || 0) - (g.eli_paid || 0)) }))
    .sort((a, b) => {
      const da = a.date || '', db = b.date || '';
      if (da > db) return -1;
      if (da < db) return 1;
      return 0;
    });

  const totalCost = r2(rows.reduce((s, g) => s + (g.eli_cost || 0), 0));
  const totalPaid = r2(rows.reduce((s, g) => s + (g.eli_paid || 0), 0));
  const totalOwed = r2(totalCost - totalPaid);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Eli — Debt Tracker</div>
          <div className="page-subtitle">All amounts in € · {rows.length} game{rows.length !== 1 ? 's' : ''} with an Eli cost</div>
        </div>
      </div>

      {/* Totals */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 0, marginBottom: 24, overflow: 'hidden',
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <Total label="Total Eli Cost" value={fmt(totalCost)} color="#111827" />
        <Total label="Paid to Eli" value={fmt(totalPaid)} color="#1D9E75" />
        <Total label="Total Debt" value={fmt(totalOwed)} color={totalOwed > 0.005 ? '#ef4444' : '#1D9E75'} big />
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          No games have an Eli cost yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Eli Cost</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Owed</th>
                <th style={{ width: 260 }}>Record payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(g => <EliRow key={g.id} game={g} onSaved={load} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Total({ label, value, color, big }) {
  return (
    <div style={{ flex: 1, minWidth: 150, padding: '18px 22px', borderRight: '1px solid #f3f4f6' }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: big ? 28 : 22, fontWeight: 800, color: color || '#111827' }}>{value}</div>
    </div>
  );
}

function EliRow({ game, onSaved }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const owed = game.owed;

  const setPaid = async (newPaid) => {
    if (!game.id) return;
    setSaving(true);
    try {
      await fetch(`/api/games/${game.id}/eli-payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eli_paid: Math.max(0, r2(newPaid)) }),
      });
      setAmount('');
      onSaved && onSaved();
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const pay = () => {
    const a = parseFloat(amount);
    if (!a) return;
    // Record a payment → reduce the debt. Cap paid at the full cost.
    setPaid(Math.min(game.eli_cost || 0, (game.eli_paid || 0) + a));
  };

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{game.name}</td>
      <td style={{ color: 'var(--text-muted)' }}>{fmtDate(game.date)}</td>
      <td style={{ textAlign: 'right' }}>{fmt(game.eli_cost)}</td>
      <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmt(game.eli_paid || 0)}</td>
      <td style={{ textAlign: 'right', fontWeight: 700, color: owed > 0.005 ? 'var(--red)' : 'var(--green)' }}>
        {fmt(owed)}
      </td>
      <td onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#6b7280' }}>€</span>
          <input
            type="number" step="0.01" placeholder="amount paid" value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={owed <= 0.005 && !amount}
            style={{ width: 100, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          />
          <button
            onClick={pay} disabled={saving || !parseFloat(amount)}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
              cursor: (saving || !parseFloat(amount)) ? 'default' : 'pointer',
              background: (saving || !parseFloat(amount)) ? '#e5e7eb' : '#7c3aed',
              color: (saving || !parseFloat(amount)) ? '#9ca3af' : '#fff',
            }}
          >Pay</button>
          {owed > 0.005 && (
            <button
              onClick={() => setPaid(game.eli_cost || 0)} disabled={saving}
              title="Mark fully paid"
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >Settle</button>
          )}
        </div>
      </td>
    </tr>
  );
}
