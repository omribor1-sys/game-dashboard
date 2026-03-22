import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MetricCard from '../components/MetricCard';
import BarChart from '../components/BarChart';

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [editGame, setEditGame] = useState(null);   // { id, name, date, source, inv_name }
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving]     = useState(false);
  const [dismissedDups, setDismissedDups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissedDups') || '[]'); } catch { return []; }
  });
  const [dupPopup, setDupPopup] = useState(null); // { gameId, gameName }
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    fetch('/api/games')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(load, []);

  useEffect(() => {
    const close = () => setDupPopup(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleDelete = async (g) => {
    const tickets = g.tickets_sold ?? (g.bq ?? 0);
    const msg = `Delete "${g.name}"${tickets > 0 ? ` and all ${tickets} tickets` : ''}?\n\nThis cannot be undone.`;
    if (!confirm(msg)) return;

    try {
      if (g.source === 'inventory') {
        // Delete all inventory with this game_name
        await fetch('/api/inventory/by-game', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_name: g.name }),
        });
      } else {
        // Delete from games table (backend also deletes inventory)
        await fetch(`/api/games/${g.id}`, { method: 'DELETE' });
        // Also delete any inventory-only entries with same name
        await fetch('/api/inventory/by-game', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_name: g.name }),
        });
      }
      load();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const openEdit = (g) => {
    setEditGame(g);
    setEditName(g.name);
    setEditDate(g.date || '');
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const newName = editName.trim();
      const oldName = editGame.name;

      // Always rename in inventory table
      await fetch('/api/inventory/rename-game', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: newName, new_date: editDate || null }),
      });

      // If it's in games table, update there too
      if (editGame.source !== 'inventory' && editGame.id) {
        await fetch(`/api/games/${editGame.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName, date: editDate || null }),
        });
      }

      setEditGame(null);
      load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading dashboard…</div>;
  if (error)   return <div className="page"><div className="error-box">Error: {error}</div></div>;

  const { games = [], summary = {} } = data;

  const chartLabels = games.map(g => g.name.length > 20 ? g.name.slice(0, 18) + '…' : g.name);
  const chartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Net Profit',
      data: games.map(g => g.net_profit),
      backgroundColor: games.map(g => (g.net_profit >= 0 ? 'rgba(29,158,117,0.8)' : 'rgba(216,90,48,0.8)')),
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  // Detect possible duplicates (similar game names in games table vs inventory)
  const invGames = games.filter(g => g.source === 'inventory').map(g => g.name.toLowerCase());
  const dupWarnings = new Set(
    games
      .filter(g => g.source !== 'inventory' && !dismissedDups.includes(g.id))
      .filter(g => invGames.some(inv => inv.includes(g.name.toLowerCase().substring(0, 15)) || g.name.toLowerCase().includes(inv.substring(0, 15))))
      .map(g => g.id)
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Game Profitability Dashboard</div>
          <div className="page-subtitle">All amounts in € · {games.length} game{games.length !== 1 ? 's' : ''} tracked</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/upload')}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Game
        </button>
      </div>

      <div className="metrics-grid">
        <MetricCard label="Total Revenue"  value={fmt(summary.totalRevenue)} />
        <MetricCard label="Total Costs"    value={fmt(summary.totalCosts)} />
        <MetricCard label="Net Profit"     value={fmt(summary.netProfit)}   color={summary.netProfit >= 0 ? 'green' : 'red'} />
        <MetricCard label="Avg Margin"     value={`${(summary.avgMargin || 0).toFixed(1)}%`} color={summary.avgMargin >= 0 ? 'green' : 'red'} />
        <MetricCard label="Tickets Sold"   value={(summary.totalTickets || 0).toLocaleString()} />
        <MetricCard label="Games"          value={summary.gameCount || 0} />
      </div>

      {games.length > 0 && (
        <BarChart title="Net Profit per Game" labels={chartData.labels} datasets={chartData.datasets} height={260} />
      )}

      {games.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No games yet</div>
          <button className="btn btn-primary" onClick={() => navigate('/upload')}>+ Add First Game</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Tickets</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Costs</th>
                <th style={{ textAlign: 'right' }}>Net Profit</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
                <th style={{ textAlign: 'center', width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, idx) => {
                const hasTickets = (g.tickets_sold ?? 0) > 0 || (g.bq ?? 0) > 0;
                return (
                  <tr
                    key={g.id != null ? g.id : `inv-${idx}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => g.source === 'inventory'
                      ? navigate(`/game/0?name=${encodeURIComponent(g.name)}`)
                      : navigate(`/game/${g.id}`)
                    }
                  >
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: hasTickets ? '#1D9E75' : '#d1d5db',
                          display: 'inline-block',
                        }} title={hasTickets ? 'Has tickets' : 'No tickets yet'} />
                        {g.name}
                        {g.source === 'inventory' && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(inventory)</span>
                        )}
                        {dupWarnings.has(g.id) && (
                          <span style={{ position: 'relative' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDupPopup(dupPopup?.gameId === g.id ? null : { gameId: g.id, gameName: g.name }); }}
                              style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontWeight: 500, border: '1px solid #fde68a', cursor: 'pointer' }}
                            >
                              ⚠️ duplicate?
                            </button>
                            {dupPopup?.gameId === g.id && (
                              <div style={{
                                position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
                                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
                                boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: '12px 14px', minWidth: 220,
                              }} onClick={e => e.stopPropagation()}>
                                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#111827' }}>
                                  Is this a duplicate game?
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    onClick={async () => {
                                      // YES → find inventory-only game with similar name and delete it
                                      const invGame = games.find(ig => ig.source === 'inventory' &&
                                        (ig.name.toLowerCase().includes(g.name.toLowerCase().substring(0, 15)) ||
                                         g.name.toLowerCase().includes(ig.name.toLowerCase().substring(0, 15))));
                                      if (invGame) {
                                        await fetch('/api/inventory/by-game', {
                                          method: 'DELETE',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ game_name: invGame.name }),
                                        });
                                      }
                                      setDupPopup(null);
                                      load();
                                    }}
                                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                                  >
                                    ✅ Yes, delete duplicate
                                  </button>
                                  <button
                                    onClick={() => {
                                      // NO → dismiss this warning
                                      const next = [...dismissedDups, g.id];
                                      setDismissedDups(next);
                                      localStorage.setItem('dismissedDups', JSON.stringify(next));
                                      setDupPopup(null);
                                    }}
                                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 500, cursor: 'pointer', fontSize: 13 }}
                                  >
                                    ❌ No, not a duplicate
                                  </button>
                                </div>
                              </div>
                            )}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{g.date || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{g.tickets_sold ?? (g.bq ?? '—')}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(g.total_revenue)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(g.total_all_costs)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: g.net_profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmt(g.net_profit)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`badge ${g.margin_percent >= 0 ? 'badge-green' : 'badge-red'}`}>
                        {g.margin_percent != null ? `${g.margin_percent.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}
                          onClick={() => openEdit(g)}
                          title="Edit game name / date"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(g)}
                          title="Delete game and all tickets"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editGame && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setEditGame(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>✏️ Edit Game</h3>
              <button onClick={() => setEditGame(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>

            {/* Stats summary */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, background: '#f9fafb', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1D9E75' }}>{editGame.tickets_sold ?? editGame.bq ?? 0}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Tickets</div>
              </div>
              <div style={{ flex: 1, background: '#f9fafb', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>€{(editGame.total_all_costs || 0).toFixed(2)}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Costs</div>
              </div>
              <div style={{ flex: 1, background: '#f9fafb', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: editGame.net_profit >= 0 ? '#1D9E75' : '#ef4444' }}>
                  €{(editGame.net_profit || 0).toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Profit</div>
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>Game Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            {/* Date */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>Date</label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            {/* Info about source */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#166534' }}>
              {editGame.source === 'inventory'
                ? `📦 Inventory-only game — name change will update all ${editGame.bq ?? 0} tickets`
                : `📊 Game with financial tracking — changes update both game record and inventory`}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setEditGame(null)}
                style={{ flex: '0 0 auto', padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={() => { setEditGame(null); navigate(`/inventory/bulk-import?game=${encodeURIComponent(editGame.name)}`); }}
                style={{ flex: '0 0 auto', padding: '9px 16px', borderRadius: 8, border: '1px solid #1D9E75', background: '#f0fdf4', color: '#1D9E75', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
                📤 Re-import Tickets
              </button>
              <button onClick={handleSaveEdit} disabled={saving || !editName.trim()}
                style={{ flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none', background: saving ? '#9ca3af' : '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : '✅ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function recalcSummary(games) {
  const totalRevenue = games.reduce((s, g) => s + (g.total_revenue || 0), 0);
  const totalCosts   = games.reduce((s, g) => s + (g.total_all_costs || 0), 0);
  const netProfit    = games.reduce((s, g) => s + (g.net_profit || 0), 0);
  return {
    totalRevenue, totalCosts, netProfit,
    totalTickets: games.reduce((s, g) => s + (g.tickets_sold || 0), 0),
    gameCount: games.length,
    avgMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0,
  };
}
