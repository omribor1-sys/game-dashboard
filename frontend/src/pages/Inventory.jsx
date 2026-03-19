import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API = '/api';

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Num({ n, red }) {
  if (!n) return <span style={{ color: '#9ca3af' }}>0</span>;
  return <span style={{ color: red && n > 0 ? '#D85A30' : '#111827', fontWeight: 600 }}>{n}</span>;
}

// ── STATUS badge ─────────────────────────────────────────────────────────────
const STATUS_META = {
  Available:  { cls: 'badge-blue',   label: 'Available'  },
  Reserved:   { cls: 'badge-amber',  label: 'Reserved'   },
  Sold:       { cls: 'badge-green',  label: 'Sold'       },
  Delivered:  { cls: 'badge-gray',   label: 'Delivered'  },
  Cancelled:  { cls: 'badge-red',    label: 'Cancelled'  },
};
const ALL_STATUSES = Object.keys(STATUS_META);

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { cls: 'badge-gray', label: status };
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

// ── Editable status dropdown ──────────────────────────────────────────────────
function EditableStatus({ itemId, current, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer' }}>
        <StatusBadge status={current} /> <span style={{ fontSize: 10, color: '#9ca3af' }}>▼</span>
      </span>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 50, minWidth: 130 }}>
          {ALL_STATUSES.map(s => (
            <div key={s} onClick={() => { setOpen(false); if (s !== current) onChange(itemId, { status: s }); }}
              style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, background: s === current ? '#f3f4f6' : 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = s === current ? '#f3f4f6' : 'transparent'}>
              <StatusBadge status={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Edit ticket modal ─────────────────────────────────────────────────────────
function EditModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({
    member_number: item.member_number || '',
    seat:          item.seat          || '',
    category:      item.category      || '',
    buy_price:     item.buy_price     ?? 0,
    sell_price:    item.sell_price    ?? 0,
    status:        item.status        || 'Available',
    notes:         item.notes         || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>Edit Ticket</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            ['Member Number', 'member_number', 'text'],
            ['Seat (block-row-seat)', 'seat', 'text'],
            ['Category', 'category', 'text'],
            ['Buy Price (€)', 'buy_price', 'number'],
            ['Sell Price (€)', 'sell_price', 'number'],
            ['Notes', 'notes', 'text'],
          ].map(([label, key, type]) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>{label}</label>
              <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 14 }}>
              {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
          <button onClick={() => onSave(item.id, form)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── FLAT TICKET LIST (See Inventory) ─────────────────────────────────────────
function TicketList({ gameName, onBack }) {
  const [tickets, setTickets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`${API}/inventory?search=${encodeURIComponent(gameName)}`);
    const data = await res.json();
    setTickets(Array.isArray(data) ? data.filter(t => t.game_name === gameName) : []);
    setLoading(false);
  }, [gameName]);

  useEffect(() => { load(); }, [load]);

  const updateItem = async (id, body) => {
    await fetch(`${API}/inventory/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setEditItem(null);
    load();
  };

  const deleteItem = async (id) => {
    if (!confirm('Delete this ticket?')) return;
    await fetch(`${API}/inventory/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      {editItem && <EditModal item={editItem} onSave={updateItem} onClose={() => setEditItem(null)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: 0 }}>← Back</button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{gameName}</h2>
        <span style={{ background: '#f3f4f6', borderRadius: 20, padding: '2px 10px', fontSize: 13, color: '#6b7280' }}>{tickets.length} tickets</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No tickets found</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['Member #', 'Seat', 'Category', 'Buy', 'Sell', 'Profit', 'Status', 'Notes', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const profit = (t.sell_price || 0) - (t.buy_price || 0);
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 10px', color: '#374151' }}>{t.member_number || '—'}</td>
                    <td style={{ padding: '10px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{t.seat || '—'}</td>
                    <td style={{ padding: '10px 10px', color: '#6b7280' }}>{t.category || '—'}</td>
                    <td style={{ padding: '10px 10px', color: '#374151' }}>{fmt(t.buy_price)}</td>
                    <td style={{ padding: '10px 10px', color: '#374151' }}>{fmt(t.sell_price)}</td>
                    <td style={{ padding: '10px 10px', color: profit >= 0 ? '#1D9E75' : '#D85A30', fontWeight: 600 }}>{fmt(profit)}</td>
                    <td style={{ padding: '10px 10px' }}><EditableStatus itemId={t.id} current={t.status} onChange={updateItem} /></td>
                    <td style={{ padding: '10px 10px', color: '#9ca3af', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || '—'}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setEditItem(t)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                        <button onClick={() => deleteItem(t.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#D85A30', cursor: 'pointer', fontSize: 12 }}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MAIN: GAMES TABLE ─────────────────────────────────────────────────────────
export default function Inventory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewGame = searchParams.get('view'); // game name when "See Inventory" clicked

  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/inventory/stats-by-game`)
      .then(r => r.json())
      .then(d => { setGames(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // If a game is selected → show flat ticket list
  if (viewGame) {
    return (
      <div style={{ padding: '24px 20px' }}>
        <TicketList gameName={viewGame} onBack={() => navigate('/inventory')} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inventory</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/inventory/add')}
            style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
            + Add Ticket
          </button>
          <button onClick={() => navigate('/inventory/bulk-import')}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            ↑ Bulk Import
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading...</div>
      ) : games.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No inventory yet</div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>Upload an Excel file to get started</div>
          <button onClick={() => navigate('/inventory/bulk-import')}
            style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            ↑ Bulk Import
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={th}>Event</th>
                <th style={{ ...th, textAlign: 'center' }} title="Bought Quantity — total tickets">BQ</th>
                <th style={{ ...th, textAlign: 'center' }} title="Order Quantity — orders linked">OQ</th>
                <th style={{ ...th, textAlign: 'center' }} title="Sold Quantity — sold/delivered">SQ</th>
                <th style={{ ...th, textAlign: 'center', color: '#D85A30' }} title="Missing — unsold & unreserved">MQ</th>
                <th style={{ ...th, textAlign: 'right', color: '#1D9E75' }}>Income</th>
                <th style={{ ...th, textAlign: 'right' }}>Inventory</th>
                <th style={{ ...th, textAlign: 'right' }}>Profit</th>
                <th style={{ ...th, textAlign: 'right' }}>Margin</th>
                <th style={{ ...th, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {games.map((g, i) => {
                const profitColor = g.profit > 0 ? '#1D9E75' : g.profit < 0 ? '#D85A30' : '#9ca3af';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                    {/* Event name + date */}
                    <td style={{ padding: '14px 12px', minWidth: 200 }}>
                      <div style={{ fontWeight: 600, color: '#111827', marginBottom: 2 }}>{g.game_name}</div>
                      {g.game_date && <div style={{ fontSize: 12, color: '#9ca3af' }}>{g.game_date}</div>}
                    </td>

                    {/* BQ */}
                    <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                      <Num n={g.bq} />
                    </td>

                    {/* OQ */}
                    <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                      <Num n={g.oq} />
                    </td>

                    {/* SQ */}
                    <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                      <Num n={g.sq} />
                    </td>

                    {/* MQ — red if > 0 */}
                    <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                      {g.mq > 0
                        ? <span style={{ background: '#fef2f2', color: '#D85A30', fontWeight: 700, borderRadius: 6, padding: '2px 8px' }}>{g.mq}</span>
                        : <span style={{ color: '#9ca3af' }}>0</span>}
                    </td>

                    {/* Income */}
                    <td style={{ padding: '14px 8px', textAlign: 'right', color: '#1D9E75', fontWeight: 600 }}>{fmt(g.income)}</td>

                    {/* Inventory cost */}
                    <td style={{ padding: '14px 8px', textAlign: 'right', color: '#374151' }}>{fmt(g.inventory_cost)}</td>

                    {/* Profit */}
                    <td style={{ padding: '14px 8px', textAlign: 'right', fontWeight: 700, color: profitColor }}>{fmt(g.profit)}</td>

                    {/* Margin */}
                    <td style={{ padding: '14px 8px', textAlign: 'right', color: profitColor, fontWeight: 600 }}>
                      {g.income > 0 ? `${g.margin}%` : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => navigate(`/inventory/bulk-import?game=${encodeURIComponent(g.game_name)}&date=${g.game_date || ''}`)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          + Add
                        </button>
                        <button
                          onClick={() => navigate(`/inventory?view=${encodeURIComponent(g.game_name)}`)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          See Inventory
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
    </div>
  );
}

const th = {
  padding: '10px 12px',
  textAlign: 'left',
  color: '#6b7280',
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};
