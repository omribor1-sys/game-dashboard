import React, { useState, useEffect, useCallback, useRef } from 'react';

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Paid', 'Delivered', 'Cancelled'];

const ORDER_STATUS_META = {
  Pending:   { cls: 'badge-amber', label: 'Pending'   },
  Confirmed: { cls: 'badge-blue',  label: 'Confirmed' },
  Paid:      { cls: 'badge-green', label: 'Paid'      },
  Delivered: { cls: 'badge-gray',  label: 'Delivered' },
  Cancelled: { cls: 'badge-red',   label: 'Cancelled' },
};

const INV_STATUS_META = {
  Available:  { cls: 'badge-blue',  label: 'Available'  },
  Reserved:   { cls: 'badge-amber', label: 'Reserved'   },
  Sold:       { cls: 'badge-green', label: 'Sold'       },
  Delivered:  { cls: 'badge-gray',  label: 'Delivered'  },
  Cancelled:  { cls: 'badge-red',   label: 'Cancelled'  },
};

function fmt(n) {
  if (n == null) return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status, meta }) {
  const m = (meta || {})[status] || { cls: 'badge-gray', label: status };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

// ── SmartSearch: type-ahead with "Add new" option ───────────────────────────
function SmartSearch({ label, value, onChange, fetchUrl, placeholder }) {
  const [options, setOptions]   = useState([]);
  const [query, setQuery]       = useState(value || '');
  const [open, setOpen]         = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const ref = useRef();

  // Load options once on focus
  async function load() {
    if (loaded) return;
    try {
      const res  = await fetch(fetchUrl);
      const data = await res.json();
      setOptions(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch (_) {}
  }

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const exactMatch = options.some(o => o.toLowerCase() === query.toLowerCase().trim());

  function select(val) {
    setQuery(val);
    onChange(val);
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div className="form-group" ref={ref} style={{ position: 'relative', marginBottom: 0 }}>
      {label && <label>{label}</label>}
      <input
        type="text"
        value={query}
        placeholder={placeholder || `Search or type new…`}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { load(); setOpen(true); }}
        autoComplete="off"
      />
      {open && (query.trim() || filtered.length > 0) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map(opt => (
            <div key={opt} onMouseDown={() => select(opt)}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14,
                background: opt === query ? '#f0fdf4' : 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = opt === query ? '#f0fdf4' : 'transparent'}>
              {opt}
            </div>
          ))}
          {query.trim() && !exactMatch && (
            <div onMouseDown={() => select(query.trim())}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14,
                color: '#1D9E75', fontWeight: 600, borderTop: filtered.length ? '1px solid #f3f4f6' : 'none' }}>
              + Add "{query.trim()}"
            </div>
          )}
          {!query.trim() && filtered.length === 0 && (
            <div style={{ padding: '9px 14px', fontSize: 13, color: '#9ca3af' }}>No options yet — just type</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hook: load games list ────────────────────────────────────────────────────
function useGames() {
  const [games, setGames] = useState([]);
  useEffect(() => {
    fetch('/api/games')
      .then(r => r.json())
      .then(data => setGames(Array.isArray(data.games) ? data.games : []))
      .catch(() => {});
  }, []);
  return games;
}

// ── New Order Modal ──────────────────────────────────────────────────────────
function NewOrderModal({ onSave, onClose }) {
  const [form, setForm] = useState({ buyer_name: '', buyer_email: '', buyer_phone: '', notes: '', game_name: '', order_number: '', sales_channel: '', total_amount: '', ticket_quantity: '1', category: '', row_seat: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function upd(field, val) { setForm(p => ({ ...p, [field]: val })); }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSave(data);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <ModalShell title="New Order" onClose={onClose}>
      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}
      <SmartSearch label="Game" value={form.game_name} onChange={v => upd('game_name', v)} fetchUrl="/api/orders/game-names" placeholder="Search or type game name…" />
      <div style={{ height: 14 }} />
      <SmartSearch label="Sales Channel" value={form.sales_channel} onChange={v => upd('sales_channel', v)} fetchUrl="/api/orders/sales-channels" placeholder="e.g. StubHub, Viagogo…" />
      <div style={{ height: 14 }} />
      <div className="form-group">
        <label>Order Number</label>
        <input type="text" placeholder="e.g. ORD-001" value={form.order_number} onChange={e => upd('order_number', e.target.value)} />
      </div>
      <div className="form-group">
        <label>Buyer Name</label>
        <input type="text" placeholder="Full name" value={form.buyer_name} onChange={e => upd('buyer_name', e.target.value)} />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input type="email" placeholder="buyer@example.com" value={form.buyer_email} onChange={e => upd('buyer_email', e.target.value)} />
      </div>
      <div className="form-group">
        <label>Phone</label>
        <input type="tel" placeholder="+972 50 000 0000" value={form.buyer_phone} onChange={e => upd('buyer_phone', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Total Amount (€)</label>
          <input type="number" step="0.01" placeholder="0.00" value={form.total_amount} onChange={e => upd('total_amount', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Tickets</label>
          <input type="number" min="1" placeholder="1" value={form.ticket_quantity} onChange={e => upd('ticket_quantity', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Category</label>
          <input type="text" placeholder="e.g. Longside Lower" value={form.category} onChange={e => upd('category', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Row / Seat</label>
          <input type="text" placeholder="e.g. Row A, Block 9" value={form.row_seat} onChange={e => upd('row_seat', e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 14 }}>
        <label>Notes</label>
        <input type="text" placeholder="Optional" value={form.notes} onChange={e => upd('notes', e.target.value)} />
      </div>
      <ModalFooter onCancel={onClose} onSave={handleSave} saving={saving} label="Create Order" />
    </ModalShell>
  );
}

// ── Edit Order Modal ─────────────────────────────────────────────────────────
function EditOrderModal({ order, onSave, onClose }) {
  const [form, setForm] = useState({
    buyer_name:    order.buyer_name    || '',
    buyer_email:   order.buyer_email   || '',
    buyer_phone:   order.buyer_phone   || '',
    status:        order.status        || 'Pending',
    notes:           order.notes           || '',
    game_name:       order.game_name       || '',
    order_number:    order.order_number    || '',
    sales_channel:   order.sales_channel   || '',
    total_amount:    order.total_amount    != null ? order.total_amount : '',
    ticket_quantity: order.ticket_quantity != null ? order.ticket_quantity : '1',
    category:        order.category        || '',
    row_seat:        order.row_seat        || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function upd(field, val) { setForm(p => ({ ...p, [field]: val })); }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res  = await fetch(`/api/orders/${order.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSave(data);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <ModalShell title={`Edit Order #${order.id}`} onClose={onClose}>
      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}
      <SmartSearch label="Game" value={form.game_name} onChange={v => upd('game_name', v)} fetchUrl="/api/orders/game-names" placeholder="Search or type game name…" />
      <div style={{ height: 14 }} />
      <SmartSearch label="Sales Channel" value={form.sales_channel} onChange={v => upd('sales_channel', v)} fetchUrl="/api/orders/sales-channels" placeholder="e.g. StubHub, Viagogo…" />
      <div style={{ height: 14 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Order Number</label>
          <input type="text" value={form.order_number} onChange={e => upd('order_number', e.target.value)} placeholder="e.g. ORD-001" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Status</label>
          <select value={form.status} onChange={e => upd('status', e.target.value)}>
            {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Buyer Name</label>
          <input type="text" value={form.buyer_name} onChange={e => upd('buyer_name', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Phone</label>
          <input type="tel" value={form.buyer_phone} onChange={e => upd('buyer_phone', e.target.value)} />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1', marginBottom: 0 }}>
          <label>Email</label>
          <input type="email" value={form.buyer_email} onChange={e => upd('buyer_email', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Total Amount (€)</label>
          <input type="number" step="0.01" value={form.total_amount} onChange={e => upd('total_amount', e.target.value)} placeholder="0.00" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Tickets</label>
          <input type="number" min="1" value={form.ticket_quantity} onChange={e => upd('ticket_quantity', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Category</label>
          <input type="text" value={form.category} onChange={e => upd('category', e.target.value)} placeholder="e.g. Longside Lower" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Row / Seat</label>
          <input type="text" value={form.row_seat} onChange={e => upd('row_seat', e.target.value)} placeholder="e.g. Row A, Block 9" />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1', marginBottom: 0 }}>
          <label>Notes</label>
          <input type="text" value={form.notes} onChange={e => upd('notes', e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <ModalFooter onCancel={onClose} onSave={handleSave} saving={saving} label="Save Changes" />
      </div>
    </ModalShell>
  );
}

// ── Add Ticket to Order Modal ─────────────────────────────────────────────────
function AddTicketModal({ order, onSave, onClose }) {
  const [allInventory, setAllInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // If order has a linked game, pre-filter to that game; otherwise allow user to pick
  const [gameFilter, setGameFilter] = useState(order.game_id ? String(order.game_id) : '');

  useEffect(() => {
    fetch('/api/inventory?status=Available')
      .then(r => r.json())
      .then(data => { setAllInventory(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Unique games in available inventory for the filter dropdown
  const availableGames = Array.from(
    new Map(allInventory.filter(i => i.game_id).map(i => [i.game_id, i.game_name])).entries()
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  const inventory = gameFilter
    ? allInventory.filter(i => String(i.game_id) === gameFilter)
    : allInventory;

  function toggleSelect(id) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleGameFilterChange(e) {
    setGameFilter(e.target.value);
    setSelected([]); // clear selection when filter changes
  }

  async function handleAdd() {
    if (selected.length === 0) { setError('Select at least one ticket'); return; }
    setSaving(true);
    setError('');
    try {
      let lastOrder = null;
      for (const invId of selected) {
        const res = await fetch(`/api/orders/${order.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory_id: invId }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        lastOrder = data;
      }
      onSave(lastOrder);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Add Tickets to Order #${order.id}`} onClose={onClose} wide>
      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}
      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading available tickets…</div>
      ) : (
        <>
          {/* Game filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {order.game_id ? 'Game filter (pre-set from order):' : 'Filter by game:'}
            </label>
            <select
              value={gameFilter}
              onChange={handleGameFilterChange}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, flex: 1 }}
            >
              <option value="">— All games —</option>
              {availableGames.map(g => (
                <option key={g.id} value={String(g.id)}>{g.name}</option>
              ))}
            </select>
          </div>

          {inventory.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              No available tickets{gameFilter ? ' for this game' : ' in inventory'}.
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Select one or more Available tickets to add to this order. They will become Reserved.
              </p>
              <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>Game</th>
                      <th>Date</th>
                      <th>Section</th>
                      <th>Seat</th>
                      <th style={{ textAlign: 'right' }}>Sell Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(it => (
                      <tr
                        key={it.id}
                        onClick={() => toggleSelect(it.id)}
                        style={{ cursor: 'pointer', background: selected.includes(it.id) ? 'var(--green-light)' : '' }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(it.id)}
                            onChange={() => toggleSelect(it.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{it.game_name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{it.game_date || '—'}</td>
                        <td>{it.section || '—'}</td>
                        <td>{it.seat || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(it.sell_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                {selected.length} ticket{selected.length !== 1 ? 's' : ''} selected
              </div>
            </>
          )}
        </>
      )}
      <div style={{ marginTop: 16 }}>
        <ModalFooter
          onCancel={onClose}
          onSave={handleAdd}
          saving={saving}
          label={`Add ${selected.length || ''} Ticket${selected.length !== 1 ? 's' : ''}`}
          disabled={selected.length === 0}
        />
      </div>
    </ModalShell>
  );
}

// ── Shared modal shell ────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: wide ? 700 : 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onSave, saving, label, disabled }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      <button className="btn btn-primary" onClick={onSave} disabled={saving || disabled}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────
// ── Game Accordion — groups OrderCards by game_name ──────────────────────────
function GameAccordion({ orders, onEdit, onDelete, onAddTicket, onRemoveTicket, onStatusChange, onTotalChange }) {
  const [openGames, setOpenGames] = useState({});

  // Group orders by game_name (null/empty → "No Game")
  const groups = {};
  for (const o of orders) {
    const key = o.game_name || 'No Game';
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  }
  // Sort: games with orders first, alphabetically
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'No Game') return 1;
    if (b === 'No Game') return -1;
    return a.localeCompare(b);
  });

  // Open all by default on first render
  useState(() => {
    const init = {};
    sortedKeys.forEach(k => { init[k] = true; });
    setOpenGames(init);
  });

  function toggle(key) {
    setOpenGames(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div>
      {sortedKeys.map(game => {
        const gameOrders = groups[game];
        const isOpen     = openGames[game] !== false;
        const gameTotal  = gameOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
        const gameTickets = gameOrders.reduce((s, o) => s + (o.ticket_quantity || 1), 0);

        return (
          <div key={game} style={{ marginBottom: 16 }}>
            {/* Game header */}
            <div
              onClick={() => toggle(game)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', background: '#F0FDF9',
                border: '1px solid #D1FAE5', borderRadius: isOpen ? '10px 10px 0 0' : 10,
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#1D9E75" strokeWidth="2.5"
                  style={{ transform: isOpen ? 'rotate(90deg)' : '', transition: 'transform 0.2s', flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#065F46' }}>{game}</span>
                <span style={{
                  background: '#D1FAE5', color: '#065F46', borderRadius: 20,
                  fontSize: 12, fontWeight: 600, padding: '1px 8px'
                }}>
                  {gameOrders.length} order{gameOrders.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#6B7280' }}>🎫 {gameTickets} tickets</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1D9E75' }}>{fmt(gameTotal)}</span>
              </div>
            </div>

            {/* Orders list */}
            {isOpen && (
              <div style={{ border: '1px solid #D1FAE5', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                {gameOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onAddTicket={onAddTicket}
                    onRemoveTicket={onRemoveTicket}
                    onStatusChange={onStatusChange}
                    onTotalChange={onTotalChange}
                    nested
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order, onEdit, onDelete, onAddTicket, onRemoveTicket, onStatusChange, onTotalChange, nested }) {
  const [expanded, setExpanded] = useState(false);
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalValue, setTotalValue] = useState('');

  return (
    <div className="card" style={{ marginBottom: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', ...(nested ? {} : { marginBottom: 16, borderRadius: 10, border: '1px solid var(--border)' }) }}>
      {/* Header row */}
      <div
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {order.order_number
              ? <span style={{ color: '#1D9E75' }}>{order.order_number}</span>
              : <span>Order #{order.id}</span>}
            {order.buyer_name && (
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13, marginLeft: 10 }}>
                {order.buyer_name}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {order.sales_channel && (
              <span style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 7px', color: '#374151', fontWeight: 500 }}>{order.sales_channel}</span>
            )}
            {order.category && <span style={{ color: '#6b7280' }}>{order.ticket_quantity > 1 ? `${order.ticket_quantity}×` : ''} {order.category}</span>}
            {order.row_seat && <span style={{ color: '#9ca3af' }}>{order.row_seat}</span>}
            {order.buyer_email && <span>{order.buyer_email}</span>}
            {order.buyer_phone && <span>{order.buyer_phone}</span>}
            {order.notes && <span style={{ fontStyle: 'italic' }}>{order.notes}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tickets</div>
            <div style={{ fontWeight: 700 }}>{order.items?.length ?? 0}</div>
          </div>
          <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Total</div>
            {editingTotal ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: '#6B7280' }}>€</span>
                <input
                  type="number"
                  step="0.01"
                  value={totalValue}
                  autoFocus
                  onChange={e => setTotalValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onTotalChange(order.id, parseFloat(totalValue) || 0); setEditingTotal(false); }
                    if (e.key === 'Escape') setEditingTotal(false);
                  }}
                  style={{
                    width: 80, padding: '3px 6px', borderRadius: 5,
                    border: '1px solid #1D9E75', fontSize: 13, outline: 'none'
                  }}
                />
                <button
                  onClick={() => { onTotalChange(order.id, parseFloat(totalValue) || 0); setEditingTotal(false); }}
                  style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 7px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >✓</button>
                <button
                  onClick={() => setEditingTotal(false)}
                  style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 5, padding: '3px 6px', fontSize: 12, color: '#6B7280', cursor: 'pointer' }}
                >✕</button>
              </div>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', justifyContent: 'flex-end' }}
                onClick={() => { setTotalValue(order.total_amount || ''); setEditingTotal(true); }}
                title="Click to edit"
              >
                <span style={{ fontWeight: 700, color: order.total_amount ? 'var(--green)' : '#D1D5DB' }}>
                  {order.total_amount ? fmt(order.total_amount) : '— set'}
                </span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>✏</span>
              </div>
            )}
          </div>

          {/* Inline status change */}
          <div onClick={e => e.stopPropagation()}>
            <select
              value={order.status}
              onChange={e => onStatusChange(order.id, e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer', outline: 'none' }}
            >
              {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-sm btn-ghost" onClick={() => onEdit(order)}>Edit</button>
            <button className="btn btn-sm btn-ghost" onClick={() => onAddTicket(order)}>+ Ticket</button>
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(order)}>Delete</button>
          </div>

          <svg
            width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)" strokeWidth="2"
            style={{ transform: expanded ? 'rotate(180deg)' : '', transition: 'transform 0.2s', flexShrink: 0 }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {order.items?.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No tickets in this order yet. Click "+ Ticket" to add some.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Game</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Section</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Seat</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Sell Price</th>
                  <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {order.items.map(it => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{it.game_name}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{it.section || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{it.seat || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>
                      <StatusBadge status={it.status} meta={INV_STATUS_META} />
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>
                      {fmt(it.sell_price)}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => onRemoveTicket(order.id, it.id)}
                        title="Remove from order"
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'new' | { type: 'edit'|'addTicket', order }

  const fetchOrders = useCallback(async () => {
    try {
      const data = await fetch('/api/orders').then(r => r.json());
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  function mergeOrder(updated) {
    setOrders(prev => {
      const exists = prev.find(o => o.id === updated.id);
      if (exists) return prev.map(o => o.id === updated.id ? updated : o);
      return [updated, ...prev];
    });
  }

  async function handleTotalChange(orderId, total_amount) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_amount }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      mergeOrder(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleStatusChange(orderId, status) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      mergeOrder(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(order) {
    if (!confirm(`Delete Order #${order.id}${order.buyer_name ? ` for ${order.buyer_name}` : ''}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRemoveTicket(orderId, itemId) {
    if (!confirm('Remove this ticket from the order? It will become Available again.')) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      mergeOrder(data);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="loading">Loading orders…</div>;

  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const activeOrders = orders.filter(o => !['Cancelled', 'Delivered'].includes(o.status));

  return (
    <div className="page">
      {/* Modals */}
      {modal === 'new' && (
        <NewOrderModal
          onSave={data => { mergeOrder(data); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit' && (
        <EditOrderModal
          order={modal.order}
          onSave={data => { mergeOrder(data); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'addTicket' && (
        <AddTicketModal
          order={modal.order}
          onSave={data => { mergeOrder(data); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Orders</div>
          <div className="page-subtitle">{orders.length} order{orders.length !== 1 ? 's' : ''} · {activeOrders.length} active</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Order
        </button>
      </div>

      {error && (
        <div className="error-box" onClick={() => setError('')} style={{ cursor: 'pointer', marginBottom: 20 }}>
          {error} ✕
        </div>
      )}

      {/* Summary */}
      <div className="metrics-grid" style={{ marginBottom: 24 }}>
        <div className="metric-card">
          <div className="label">Total Orders</div>
          <div className="value">{orders.length}</div>
        </div>
        <div className="metric-card">
          <div className="label">Active</div>
          <div className="value amber">{activeOrders.length}</div>
        </div>
        <div className="metric-card">
          <div className="label">Paid / Delivered</div>
          <div className="value green">{orders.filter(o => o.status === 'Paid' || o.status === 'Delivered').length}</div>
        </div>
        <div className="metric-card">
          <div className="label">Total Revenue</div>
          <div className="value green">{fmt(totalRevenue)}</div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No orders yet</div>
          <div style={{ marginBottom: 20 }}>Create your first order to start managing sales</div>
          <button className="btn btn-primary" onClick={() => setModal('new')}>+ New Order</button>
        </div>
      ) : (
        <GameAccordion
          orders={orders}
          onEdit={o => setModal({ type: 'edit', order: o })}
          onDelete={handleDelete}
          onAddTicket={o => setModal({ type: 'addTicket', order: o })}
          onRemoveTicket={handleRemoveTicket}
          onStatusChange={handleStatusChange}
          onTotalChange={handleTotalChange}
        />
      )}
    </div>
  );
}
