export default function PLTable({ game, editCosts, setEditCosts, onSave, saving }) {
  const isProfit = game.net_profit >= 0;
  const editable = !!setEditCosts;

  const extraTotal = (editCosts || game.extra_costs || []).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const totalCosts = game.total_ticket_cost + (game.eli_cost || 0) + extraTotal;
  const netProfit  = game.total_revenue - totalCosts;
  const margin     = game.total_revenue > 0 ? (netProfit / game.total_revenue) * 100 : 0;

  const fixedRows = [
    { label: 'Revenue',     value: game.total_revenue,     type: 'revenue' },
    { label: 'Ticket Cost', value: -game.total_ticket_cost, type: 'cost' },
    ...(game.eli_cost ? [{ label: 'ELI Cost', value: -game.eli_cost, type: 'cost' }] : []),
  ];

  const costs = editCosts || game.extra_costs || [];

  return (
    <div className="table-wrap">
      <table className="pl-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Amount (€)</th>
            <th style={{ textAlign: 'right' }}>% of Revenue</th>
            {editable && <th style={{ width: 32 }} />}
          </tr>
        </thead>
        <tbody>
          {/* Fixed rows */}
          {fixedRows.map((r, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text)' }}>{r.label}</td>
              <td className={r.type} style={{ textAlign: 'right', fontWeight: 500 }}>
                {r.type === 'cost' ? '−' : ''}{fmt(Math.abs(r.value))}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                {game.total_revenue > 0 ? `${Math.abs((r.value / game.total_revenue) * 100).toFixed(1)}%` : '—'}
              </td>
              {editable && <td />}
            </tr>
          ))}

          {/* Editable extra cost rows */}
          {costs.map((c, i) => (
            <tr key={`ec-${i}`} style={{ background: editable ? 'rgba(186,117,23,0.04)' : undefined }}>
              <td>
                {editable ? (
                  <input
                    type="text"
                    value={c.label}
                    placeholder="Item name..."
                    onChange={e => setEditCosts(prev => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                    style={inlineInputStyle}
                  />
                ) : c.label}
              </td>
              <td style={{ textAlign: 'right' }}>
                {editable ? (
                  <input
                    type="number"
                    value={c.amount}
                    min="0"
                    step="0.01"
                    onChange={e => setEditCosts(prev => prev.map((x, idx) => idx === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                    style={{ ...inlineInputStyle, textAlign: 'right', width: 110 }}
                  />
                ) : (
                  <span className="cost">−{fmt(c.amount)}</span>
                )}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                {game.total_revenue > 0 ? `${((parseFloat(c.amount) || 0) / game.total_revenue * 100).toFixed(1)}%` : '—'}
              </td>
              {editable && (
                <td>
                  <button
                    onClick={() => setEditCosts(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                    title="Remove"
                  >×</button>
                </td>
              )}
            </tr>
          ))}

          {/* Add row button */}
          {editable && (
            <tr>
              <td colSpan={4}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, marginTop: 2 }}
                  onClick={() => setEditCosts(prev => [...prev, { label: '', amount: 0 }])}
                >
                  + Add Cost
                </button>
              </td>
            </tr>
          )}

          {/* Net Profit row */}
          <tr className={`total-row ${netProfit >= 0 ? 'profit-row' : 'loss-row'}`}>
            <td>Net Profit</td>
            <td style={{ textAlign: 'right' }}>{fmt(netProfit)}</td>
            <td style={{ textAlign: 'right' }}>{margin.toFixed(1)}%</td>
            {editable && <td />}
          </tr>
        </tbody>
      </table>

      {/* Save button */}
      {editable && (
        <div style={{ padding: '12px 0 4px' }}>
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save & Recalculate'}
          </button>
        </div>
      )}
    </div>
  );
}

const inlineInputStyle = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 13,
  background: 'var(--bg)',
  color: 'var(--text)',
  width: '100%',
  boxSizing: 'border-box',
};

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
