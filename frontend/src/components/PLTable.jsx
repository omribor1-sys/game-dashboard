export default function PLTable({ game }) {
  const isProfit = game.net_profit >= 0;

  const rows = [
    { label: 'Revenue', value: game.total_revenue, type: 'revenue' },
    { label: 'Ticket Cost', value: -game.total_ticket_cost, type: 'cost' },
    { label: 'ELI Cost', value: -game.eli_cost, type: 'cost' },
    ...(game.extra_costs || []).map(c => ({ label: c.label, value: -c.amount, type: 'cost' })),
  ];

  const totalCosts = game.total_ticket_cost + game.eli_cost +
    (game.extra_costs || []).reduce((s, c) => s + c.amount, 0);

  return (
    <div className="table-wrap">
      <table className="pl-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Amount (€)</th>
            <th style={{ textAlign: 'right' }}>% of Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.label}</td>
              <td className={r.type} style={{ textAlign: 'right', fontWeight: 500 }}>
                {r.type === 'cost' ? '−' : ''}
                {fmt(Math.abs(r.value))}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                {game.total_revenue > 0
                  ? `${Math.abs((r.value / game.total_revenue) * 100).toFixed(1)}%`
                  : '—'}
              </td>
            </tr>
          ))}
          <tr className={`total-row ${isProfit ? 'profit-row' : 'loss-row'}`}>
            <td>Net Profit</td>
            <td style={{ textAlign: 'right' }}>{fmt(game.net_profit)}</td>
            <td style={{ textAlign: 'right' }}>
              {game.margin_percent != null ? `${game.margin_percent.toFixed(1)}%` : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
