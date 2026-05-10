import { useState } from 'react';

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function marginStyle(pct) {
  if (pct == null) return { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' };
  if (pct >= 60)   return { bg: '#d1fae5', fg: '#065f46', border: '#6ee7b7' };
  if (pct >= 40)   return { bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0' };
  if (pct >= 20)   return { bg: '#fffbeb', fg: '#92400e', border: '#fcd34d' };
  if (pct >= 0)    return { bg: '#fff7ed', fg: '#c2410c', border: '#fdba74' };
  return               { bg: '#fef2f2', fg: '#991b1b', border: '#fca5a5' };
}

function MiniBar({ value, max, positive = true }) {
  const abs = Math.abs(value || 0);
  const pct = max > 0 ? Math.min((abs / max) * 100, 100) : 0;
  const isNeg = value < 0;
  const barColor = isNeg
    ? 'rgba(216,90,48,0.75)'
    : positive
      ? 'rgba(29,158,117,0.45)'
      : 'rgba(29,158,117,0.85)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, color: isNeg ? '#dc2626' : '#374151', minWidth: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(value)}
      </span>
    </div>
  );
}

const SORT_KEYS = [
  { key: 'name',          label: 'Game' },
  { key: 'date',          label: 'Date' },
  { key: 'tickets_sold',  label: 'Tickets' },
  { key: 'total_revenue', label: 'Revenue' },
  { key: 'net_profit',    label: 'Net Profit' },
  { key: 'margin_percent',label: 'Margin' },
];

export default function GamePerformancePanel({ games }) {
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  if (!games || games.length === 0) return null;

  const maxRevenue = Math.max(...games.map(g => g.total_revenue || 0));
  const maxProfit  = Math.max(...games.map(g => Math.abs(g.net_profit || 0)));

  const sorted = [...games].sort((a, b) => {
    let av = a[sortKey] ?? '';
    let bv = b[sortKey] ?? '';
    if (sortKey === 'name' || sortKey === 'date') {
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    }
    av = Number(av) || 0;
    bv = Number(bv) || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const thBase = {
    padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    borderBottom: '2px solid #e5e7eb', background: '#f9fafb',
  };
  const tdBase = { padding: '9px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };

  const heatSorted = [...games].sort((a, b) => (b.margin_percent ?? -999) - (a.margin_percent ?? -999));

  return (
    <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Sortable Performance Table ──────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>📊 Performance per Game</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Click column header to sort</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {SORT_KEYS.map(({ key, label }) => (
                  <th key={key} style={thBase} onClick={() => toggleSort(key)}>
                    {label}
                    <span style={{ marginLeft: 4, color: sortKey === key ? '#1d9e75' : '#d1d5db' }}>
                      {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((g, i) => {
                const ms = marginStyle(g.margin_percent);
                return (
                  <tr key={g.id ?? i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...tdBase, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, fontSize: 13 }}>
                      {g.name}
                    </td>
                    <td style={{ ...tdBase, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {fmtDate(g.date)}
                    </td>
                    <td style={{ ...tdBase, fontSize: 13, textAlign: 'center', width: 64 }}>
                      {g.tickets_sold ?? '—'}
                    </td>
                    <td style={{ ...tdBase, minWidth: 170 }}>
                      <MiniBar value={g.total_revenue} max={maxRevenue} positive />
                    </td>
                    <td style={{ ...tdBase, minWidth: 170 }}>
                      <MiniBar value={g.net_profit} max={maxProfit} positive={false} />
                    </td>
                    <td style={{ ...tdBase, width: 80 }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 9px', borderRadius: 20,
                        fontSize: 12, fontWeight: 700,
                        background: ms.bg, color: ms.fg, border: `1px solid ${ms.border}`,
                      }}>
                        {g.margin_percent != null ? `${g.margin_percent.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Margin Heatmap ──────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>🟩 Margin Heatmap — Best to Worst</div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap: 10, padding: 16,
        }}>
          {heatSorted.map((g, i) => {
            const ms = marginStyle(g.margin_percent);
            const shortName = g.name.length > 22 ? g.name.slice(0, 20) + '…' : g.name;
            return (
              <div key={g.id ?? i} style={{
                background: ms.bg, border: `1.5px solid ${ms.border}`,
                borderRadius: 10, padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: ms.fg, lineHeight: 1.3, minHeight: 28 }}>
                  {shortName}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: ms.fg, lineHeight: 1.1 }}>
                  {g.margin_percent != null ? `${Math.round(g.margin_percent)}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: ms.fg, opacity: 0.75 }}>
                  {fmt(g.net_profit)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
