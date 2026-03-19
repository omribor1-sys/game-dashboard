import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MetricCard from '../components/MetricCard';
import BarChart from '../components/BarChart';

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  return `€${n.toFixed(0)}`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/games')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/games/${id}`, { method: 'DELETE' });
    setData(prev => ({
      ...prev,
      games: prev.games.filter(g => g.id !== id),
      summary: recalcSummary(prev.games.filter(g => g.id !== id)),
    }));
  };

  if (loading) return <div className="loading">Loading dashboard…</div>;
  if (error) return <div className="page"><div className="error-box">Error: {error}</div></div>;

  const { games = [], summary = {} } = data;

  const chartLabels = games.map(g => g.name.length > 20 ? g.name.slice(0, 18) + '…' : g.name);
  const chartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Net Profit',
      data: games.map(g => g.net_profit),
      backgroundColor: games.map(g => g.net_profit >= 0 ? 'rgba(29,158,117,0.8)' : 'rgba(216,90,48,0.8)'),
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

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
        <MetricCard label="Total Revenue" value={fmt(summary.totalRevenue)} />
        <MetricCard label="Total Costs" value={fmt(summary.totalCosts)} />
        <MetricCard
          label="Net Profit"
          value={fmt(summary.netProfit)}
          color={summary.netProfit >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="Avg Margin"
          value={`${(summary.avgMargin || 0).toFixed(1)}%`}
          color={summary.avgMargin >= 0 ? 'green' : 'red'}
        />
        <MetricCard label="Tickets Sold" value={(summary.totalTickets || 0).toLocaleString()} />
        <MetricCard label="Games" value={summary.gameCount || 0} />
      </div>

      {games.length > 0 && (
        <BarChart
          title="Net Profit per Game"
          labels={chartData.labels}
          datasets={chartData.datasets}
          height={260}
        />
      )}

      {games.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No games yet</div>
          <div style={{ marginBottom: 20 }}>Upload your first game file to get started</div>
          <button className="btn btn-primary" onClick={() => navigate('/upload')}>
            + Add First Game
          </button>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, idx) => (
                <tr
                  key={g.id != null ? g.id : `inv-${idx}`}
                  style={{ cursor: g.source === 'inventory' ? 'default' : 'pointer' }}
                  onClick={() => g.source !== 'inventory' && navigate(`/game/${g.id}`)}
                >
                  <td style={{ fontWeight: 600 }}>
                    {g.name}
                    {g.source === 'inventory' && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(inventory)</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{g.date || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{g.tickets_sold ?? '—'}</td>
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
                    {g.source !== 'inventory' && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(g.id, g.name)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function recalcSummary(games) {
  const totalRevenue = games.reduce((s, g) => s + (g.total_revenue || 0), 0);
  const totalCosts = games.reduce((s, g) => s + (g.total_all_costs || 0), 0);
  const netProfit = games.reduce((s, g) => s + (g.net_profit || 0), 0);
  return {
    totalRevenue,
    totalCosts,
    netProfit,
    totalTickets: games.reduce((s, g) => s + (g.tickets_sold || 0), 0),
    gameCount: games.length,
    avgMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0,
  };
}
