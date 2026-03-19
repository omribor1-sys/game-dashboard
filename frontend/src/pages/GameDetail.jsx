import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MetricCard from '../components/MetricCard';
import PLTable from '../components/PLTable';
import BarChart from '../components/BarChart';

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [editCosts, setEditCosts] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setGame(d);
        setEditCosts(d.extra_costs.map(c => ({ ...c })));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id]);

  const saveCosts = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/games/${id}/costs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraCosts: editCosts }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error);
      setGame(updated);
      setEditCosts(updated.extra_costs.map(c => ({ ...c })));
    } catch (e) {
      alert('Error saving: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading game…</div>;
  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!game) return null;

  const isProfit = game.net_profit >= 0;
  const statusEntries = Object.entries(game.status_breakdown || {});
  const issueEntries = Object.entries(game.issues || {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{game.name}</div>
          <div className="page-subtitle">
            {game.date ? new Date(game.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            {game.tab_name ? ` · Sheet: ${game.tab_name}` : ''}
            {' · All amounts in €'}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>← Dashboard</button>
      </div>

      <div className="tabs">
        {['overview', 'pl', 'channels'].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {{ overview: 'Overview', pl: 'P&L', channels: 'Sales Channels' }[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="metrics-grid">
            <MetricCard label="Revenue" value={fmt(game.total_revenue)} />
            <MetricCard label="Ticket Cost" value={fmt(game.total_ticket_cost)} />
            <MetricCard label="Total Costs" value={fmt(game.total_all_costs)} />
            <MetricCard
              label="Net Profit"
              value={fmt(game.net_profit)}
              color={isProfit ? 'green' : 'red'}
              sub={game.margin_percent != null ? `${game.margin_percent.toFixed(1)}% margin` : ''}
            />
            <MetricCard label="Avg Buy Price" value={fmt(game.avg_buy_price)} sub="per ticket" />
            <MetricCard label="Avg Sell Price" value={fmt(game.avg_sell_price)} sub="per ticket" />
          </div>

          {/* P&L Breakdown */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Profit & Loss</div>
            <PLTable game={game} />
          </div>

          {/* Extra Costs Editor */}
          <div className="card card-body" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Extra Costs</div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditCosts(prev => [...prev, { label: '', amount: 0 }])}
              >
                + Add
              </button>
            </div>
            {editCosts.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>No extra costs.</div>
            )}
            {editCosts.map((cost, i) => (
              <div className="cost-row" key={i}>
                <input
                  type="text"
                  placeholder="Label"
                  value={cost.label}
                  onChange={e => setEditCosts(prev => prev.map((c, idx) => idx === i ? { ...c, label: e.target.value } : c))}
                />
                <input
                  type="number"
                  className="amount"
                  placeholder="€ Amount"
                  value={cost.amount}
                  min="0"
                  step="0.01"
                  onChange={e => setEditCosts(prev => prev.map((c, idx) => idx === i ? { ...c, amount: parseFloat(e.target.value) || 0 } : c))}
                />
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => setEditCosts(prev => prev.filter((_, idx) => idx !== i))}
                >×</button>
              </div>
            ))}
            <button className="btn btn-primary btn-sm" onClick={saveCosts} disabled={saving}>
              {saving ? 'Saving…' : '✓ Save & Recalculate'}
            </button>
          </div>

          {/* Issues / Notes */}
          {issueEntries.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Notes / Issues</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Note</th>
                      <th style={{ textAlign: 'right' }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issueEntries.map(([note, count]) => (
                      <tr key={note}>
                        <td><span className="badge badge-amber">{note}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'pl' && (
        <>
          <div style={{ marginBottom: 24 }}>
            <PLTable game={game} />
          </div>

          {/* Visual split bar */}
          <div className="card card-body" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue Breakdown</div>
            {[
              { label: 'Ticket Cost', value: game.total_ticket_cost, color: '#D85A30' },
              { label: 'ELI Cost', value: game.eli_cost, color: '#BA7517' },
              ...(game.extra_costs || []).map(c => ({ label: c.label, value: c.amount, color: '#718096' })),
              { label: 'Net Profit', value: Math.max(game.net_profit, 0), color: '#1D9E75' },
            ].map((item, i) => {
              const pct = game.total_revenue > 0 ? (item.value / game.total_revenue) * 100 : 0;
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>{item.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {fmt(item.value)} · {Math.max(pct, 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeTab === 'channels' && (
        <>
          {statusEntries.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '32px 0' }}>No sales channel data available.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                <BarChart
                  title="Tickets per Channel"
                  labels={statusEntries.map(([k]) => k)}
                  datasets={[{
                    label: 'Tickets',
                    data: statusEntries.map(([, v]) => v.count),
                    backgroundColor: 'rgba(29,158,117,0.75)',
                    borderRadius: 4,
                  }]}
                  horizontal
                  height={Math.max(200, statusEntries.length * 44)}
                />
                <BarChart
                  title="Revenue per Channel (€)"
                  labels={statusEntries.map(([k]) => k)}
                  datasets={[{
                    label: 'Revenue',
                    data: statusEntries.map(([, v]) => v.revenue),
                    backgroundColor: 'rgba(186,117,23,0.75)',
                    borderRadius: 4,
                  }]}
                  horizontal
                  height={Math.max(200, statusEntries.length * 44)}
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th style={{ textAlign: 'right' }}>Tickets</th>
                      <th style={{ textAlign: 'right' }}>%</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusEntries
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([channel, val]) => {
                        const pct = game.tickets_sold > 0 ? ((val.count / game.tickets_sold) * 100).toFixed(1) : '—';
                        return (
                          <tr key={channel}>
                            <td><span className="badge badge-gray">{channel}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{val.count}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{pct}%</td>
                            <td style={{ textAlign: 'right' }}>{fmt(val.revenue)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
