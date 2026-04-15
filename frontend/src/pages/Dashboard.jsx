import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MetricCard from '../components/MetricCard';
import BarChart from '../components/BarChart';

function fmtDate(d) {
  if (!d) return '—';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function marginColor(pct) {
  if (pct == null) return { bg: '#f3f4f6', fg: '#6b7280' };
  if (pct >= 50)   return { bg: '#ecfdf5', fg: '#065f46' };
  if (pct >= 20)   return { bg: '#fffbeb', fg: '#92400e' };
  if (pct >= 0)    return { bg: '#fff7ed', fg: '#c2410c' };
  return               { bg: '#fef2f2', fg: '#991b1b' };
}

function channelText(channels) {
  if (!channels || Object.keys(channels).length === 0) return '—';
  return Object.entries(channels)
    .map(([ch, d]) => {
      const label = ch === 'FootballTicketNet' ? 'FTN' : ch;
      return `${label} ×${d.count}`;
    })
    .join('  ·  ');
}

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [missingCosts, setMissingCosts] = useState([]);
  const [editGame, setEditGame] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving]     = useState(false);
  const [dismissedDups, setDismissedDups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissedDups') || '[]'); } catch { return []; }
  });
  const [dupPopup, setDupPopup] = useState(null);
  const [closeModal, setCloseModal] = useState(null); // { name, date, source, id }
  const [closeTicketCost, setCloseTicketCost] = useState('');
  const [closeEliCost, setCloseEliCost] = useState('');
  const [closeRevenue, setCloseRevenue] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/games').then(r => r.json()),
      fetch('/api/admin/missing-costs').then(r => r.json()).catch(() => []),
    ]).then(([gamesData, missing]) => {
      setData(gamesData);
      setMissingCosts(Array.isArray(missing) ? missing : []);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
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
        await fetch('/api/inventory/by-game', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_name: g.name }),
        });
      } else {
        await fetch(`/api/games/${g.id}`, { method: 'DELETE' });
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

      await fetch('/api/inventory/rename-game', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: newName, new_date: editDate || null }),
      });

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

  const openCloseModal = (g) => {
    setCloseModal(g);
    setCloseTicketCost('');
    setCloseEliCost('');
    setCloseRevenue('');
    setCloseDate(g.date || '');
  };

  const handleCloseGame = async () => {
    if (!closeTicketCost) return;
    setCloseSaving(true);
    try {
      await fetch('/api/games/close-by-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_name: closeModal.name,
          total_ticket_cost: parseFloat(closeTicketCost) || 0,
          eli_cost: parseFloat(closeEliCost) || 0,
          total_revenue: closeRevenue ? parseFloat(closeRevenue) : undefined,
          game_date: closeDate || null,
        }),
      });
      setCloseModal(null);
      load();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setCloseSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading dashboard…</div>;
  if (error)   return <div className="page"><div className="error-box">Error: {error}</div></div>;

  const { games = [], summary = {} } = data;

  const completedGames = games.filter(g => g.completed);
  const activeGames = games.filter(g => !g.completed);

  // Revenue vs Profit chart for completed games (sorted oldest → newest)
  const sortedCompleted = [...completedGames].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
  const revProfitChart = {
    labels: sortedCompleted.map(g => g.name.length > 18 ? g.name.slice(0, 16) + '…' : g.name),
    datasets: [
      {
        label: 'Revenue',
        data: sortedCompleted.map(g => g.total_revenue),
        backgroundColor: 'rgba(29,158,117,0.22)',
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: 'Net Profit',
        data: sortedCompleted.map(g => g.net_profit),
        backgroundColor: sortedCompleted.map(g => g.net_profit >= 0 ? 'rgba(29,158,117,0.85)' : 'rgba(216,90,48,0.85)'),
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

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

      {/* ── Missing costs warning ─────────────────────────────────────── */}
      {missingCosts.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10,
          padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14, marginBottom: 4 }}>
              נתוני עלויות חסרים — {missingCosts.length} משחק/ים
            </div>
            <div style={{ fontSize: 13, color: '#78350f' }}>
              {missingCosts.map((g, i) => (
                <span key={i} style={{ marginRight: 12 }}>
                  <strong>{g.game_name}</strong> — €{Number(g.total_revenue).toLocaleString('en-US', { minimumFractionDigits: 2 })} הכנסות, {g.order_count} הזמנות
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="metrics-grid">
        <MetricCard label="Total Revenue"  value={fmt(summary.totalRevenue)} />
        <MetricCard label="Total Costs"    value={fmt(summary.totalCosts)} />
        <MetricCard label="Net Profit"     value={fmt(summary.netProfit)}   color={summary.netProfit >= 0 ? 'green' : 'red'} />
        <MetricCard label="Avg Margin"     value={`${(summary.avgMargin || 0).toFixed(1)}%`} color={summary.avgMargin >= 0 ? 'green' : 'red'} />
        <MetricCard label="Tickets Sold"   value={(summary.totalTickets || 0).toLocaleString()} />
        <MetricCard label="Games"          value={summary.gameCount || 0} />
      </div>

      {/* ── Completed Games Summary ─────────────────────────────────── */}
      {completedGames.length > 0 && (
        <>
          <CompletedGamesTable games={completedGames} />
          {sortedCompleted.length > 1 && (
            <BarChart
              title="Revenue vs Net Profit per Game"
              labels={revProfitChart.labels}
              datasets={revProfitChart.datasets}
              height={200}
            />
          )}
        </>
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
                <th style={{ textAlign: 'center', width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, idx) => {
                const hasTickets = (g.tickets_sold ?? 0) > 0 || (g.bq ?? 0) > 0;
                return (
                  <tr
                    key={g.id != null ? g.id : `inv-${idx}`}
                    style={{ cursor: 'pointer', opacity: g.completed ? 0.7 : 1 }}
                    onClick={() => g.source === 'inventory'
                      ? navigate(`/game/0?name=${encodeURIComponent(g.name)}`)
                      : navigate(`/game/${g.id}`)
                    }
                  >
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: g.completed ? '#9ca3af' : (hasTickets ? '#1D9E75' : '#d1d5db'),
                          display: 'inline-block',
                        }} />
                        {g.name}
                        {g.completed && (
                          <span style={{ fontSize: 11, background: '#ecfdf5', color: '#065f46', padding: '1px 6px', borderRadius: 8, fontWeight: 500, border: '1px solid #bbf7d0' }}>
                            ✅ Closed
                          </span>
                        )}
                        {g.source === 'inventory' && !g.completed && (
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
                    <td style={{ color: 'var(--text-muted)' }}>{fmtDate(g.date)}</td>
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
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {!g.completed && (
                          <button
                            className="btn btn-sm"
                            style={{ background: '#f0fdf4', color: '#065f46', border: '1px solid #bbf7d0', fontSize: 11 }}
                            onClick={() => openCloseModal(g)}
                            title="Close game and enter final costs"
                          >
                            🏁 Close
                          </button>
                        )}
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
                          🗑️
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

      {/* ── Close Game Modal ─────────────────────────────────────────── */}
      {closeModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setCloseModal(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>🏁 Close Game</h3>
              <button onClick={() => setCloseModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>{closeModal.name}</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>
                Ticket Purchase Cost (€) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number" step="0.01" placeholder="e.g. 3167"
                value={closeTicketCost} onChange={e => setCloseTicketCost(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>
                Total Revenue (€) <span style={{ fontWeight: 400, color: '#9ca3af' }}>— leave blank to auto-compute from orders</span>
              </label>
              <input
                type="number" step="0.01" placeholder="e.g. 13264"
                value={closeRevenue} onChange={e => setCloseRevenue(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>
                Eli's Cost (€)
              </label>
              <input
                type="number" step="0.01" placeholder="e.g. 975"
                value={closeEliCost} onChange={e => setCloseEliCost(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>Game Date</label>
              <input
                type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            {/* Preview P&L if costs entered */}
            {closeTicketCost && (
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
                {(() => {
                  const rev = parseFloat(closeRevenue) || null;
                  const costs = (parseFloat(closeTicketCost) || 0) + (parseFloat(closeEliCost) || 0);
                  const profit = rev != null ? rev - costs : null;
                  return (
                    <>
                      {rev != null && <div style={{ marginBottom: 4, color: '#111827' }}>Revenue: {fmt(rev)}</div>}
                      <div style={{ color: '#ef4444' }}>Total costs: {fmt(costs)}</div>
                      {profit != null && (
                        <div style={{ marginTop: 6, fontWeight: 700, color: profit >= 0 ? '#1D9E75' : '#ef4444', fontSize: 15 }}>
                          Net Profit: {fmt(profit)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCloseModal(null)}
                style={{ flex: '0 0 auto', padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={handleCloseGame} disabled={closeSaving || !closeTicketCost}
                style={{ flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none', background: (closeSaving || !closeTicketCost) ? '#9ca3af' : '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 14, cursor: (closeSaving || !closeTicketCost) ? 'not-allowed' : 'pointer' }}>
                {closeSaving ? 'Saving...' : '✅ Close Game & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Game Modal ─────────────────────────────────────────── */}
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>Game Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>Date</label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#166534' }}>
              {editGame.source === 'inventory'
                ? `📦 Inventory-only game — name change will update all ${editGame.bq ?? 0} tickets`
                : `📊 Game with financial tracking — changes update both game record and inventory`}
            </div>

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

function CompletedGamesTable({ games }) {
  const [expanded, setExpanded] = useState(null);
  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  const COLS = '1fr 105px 120px 76px 130px 82px 36px';

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          background: '#1D9E75', color: '#fff',
          borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        }}>COMPLETED</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Game Summaries</span>
        <span style={{ fontSize: 13, color: '#9ca3af' }}>· {games.length} game{games.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
        overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: COLS,
          padding: '10px 20px',
          background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
          fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          <span>Game</span>
          <span>Date</span>
          <span style={{ textAlign: 'right' }}>Revenue</span>
          <span style={{ textAlign: 'right' }}>Tickets</span>
          <span style={{ textAlign: 'right' }}>Net Profit</span>
          <span style={{ textAlign: 'right' }}>Margin</span>
          <span />
        </div>

        {/* Rows */}
        {games.map((g, idx) => {
          const key = g.id ?? `c-${idx}`;
          const isOpen = expanded === key;
          const profit = g.net_profit ?? 0;
          const isLast = idx === games.length - 1;
          const mc = marginColor(g.margin_percent);
          const hasEliCost = g.eli_cost != null && g.eli_cost > 0;
          const avgProfit = g.tickets_sold > 0 ? fmt(profit / g.tickets_sold) : '—';

          return (
            <div key={key}>
              {/* Main row */}
              <div
                onClick={() => toggle(key)}
                style={{
                  display: 'grid', gridTemplateColumns: COLS,
                  padding: '13px 20px', alignItems: 'center', cursor: 'pointer',
                  borderBottom: isLast && !isOpen ? 'none' : '1px solid #f3f4f6',
                  background: isOpen ? '#f0fdf4' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{g.name}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{fmtDate(g.date)}</div>
                <div style={{ textAlign: 'right', fontSize: 14, color: '#111827', fontWeight: 500 }}>
                  {fmt(g.total_revenue)}
                </div>
                <div style={{ textAlign: 'right', fontSize: 14, color: '#374151' }}>
                  {g.tickets_sold ?? '—'}
                </div>
                <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: profit >= 0 ? '#1D9E75' : '#ef4444' }}>
                  {fmt(profit)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 8,
                    background: mc.bg, color: mc.fg,
                  }}>
                    {g.margin_percent != null ? `${g.margin_percent.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div style={{
                  textAlign: 'center', fontSize: 12, color: '#9ca3af',
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                }}>▾</div>
              </div>

              {/* Expanded detail row */}
              {isOpen && (
                <div style={{
                  padding: '14px 20px 16px',
                  background: '#f0fdf4',
                  borderBottom: isLast ? 'none' : '1px solid #d1fae5',
                  display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'flex-start',
                }}>
                  <DetailStat label="Ticket Cost" value={fmt(g.total_ticket_cost)} color="#ef4444" />
                  {hasEliCost && (
                    <DetailStat label="Eli's Cost" value={fmt(g.eli_cost)} color="#ef4444" />
                  )}
                  <DetailStat label="Total Costs" value={fmt(g.total_all_costs)} color="#ef4444" />
                  <DetailStat label="Channels" value={channelText(g.channels)} />
                  <DetailStat label="Avg Profit / Ticket" value={avgProfit} color="#1D9E75" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailStat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || '#111827' }}>{value}</div>
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
