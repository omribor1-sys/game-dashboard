import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

const API = '/api';

function fmt(n) {
  if (n == null || n === '') return '—';
  return `€${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }) {
  const s = (status || '').toLowerCase();
  let bg, color;
  if (s === 'available') { bg = '#EFF6FF'; color = '#1D4ED8'; }
  else if (s === 'reserved') { bg = '#FFFBEB'; color = '#B45309'; }
  else if (s === 'sold' || s === 'delivered') { bg = '#ECFDF5'; color = '#065F46'; }
  else if (s === 'cancelled') { bg = '#FEF2F2'; color = '#991B1B'; }
  else { bg = '#F3F4F6'; color = '#374151'; }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: bg, color
    }}>
      {status || '—'}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
      padding: '14px 18px', minWidth: 0
    }}>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gameName = searchParams.get('name');

  // Determine mode: inventory-only if id === '0' and name param present
  const isInventoryOnly = id === '0' && !!gameName;

  const [game, setGame] = useState(null);
  const [activeTab, setActiveTab] = useState('inventory');
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({ total_revenue: 0, total_ticket_cost: 0, eli_cost: 0, notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Load game info
  useEffect(() => {
    if (isInventoryOnly) {
      setGame({ name: gameName, date: null, id: null });
      setLoading(false);
      return;
    }
    fetch(`${API}/games/${id}`)
      .then(r => {
        if (r.status === 404) throw new Error('404');
        return r.json();
      })
      .then(d => {
        if (d.error) throw new Error(d.error);
        setGame(d);
        // Pre-fill summary from game data if available
        setSummary({
          total_revenue: d.total_revenue ?? 0,
          total_ticket_cost: d.total_ticket_cost ?? 0,
          eli_cost: d.eli_cost ?? 0,
          notes: d.notes ?? '',
        });
        setLoading(false);
      })
      .catch(e => {
        if (e.message === '404' && gameName) {
          // Fall back to inventory-only mode
          setGame({ name: gameName, date: null, id: null });
          setLoading(false);
        } else {
          setError(e.message);
          setLoading(false);
        }
      });
  }, [id, gameName, isInventoryOnly]);

  // Load inventory when tab is active or on mount
  useEffect(() => {
    if (!game) return;
    if (activeTab !== 'inventory') return;
    loadInventory();
  }, [game, activeTab]);

  // Load orders when tab is active
  useEffect(() => {
    if (!game) return;
    if (activeTab !== 'orders') return;
    loadOrders();
  }, [game, activeTab]);

  // Load summary when tab is active
  useEffect(() => {
    if (!game) return;
    if (activeTab !== 'summary') return;
    if (!isInventoryOnly && game.id) loadSummary();
  }, [game, activeTab]);

  function loadInventory() {
    const url = isInventoryOnly || !game.id
      ? `${API}/inventory?game_name=${encodeURIComponent(game.name)}`
      : `${API}/games/${id}/inventory`;
    fetch(url)
      .then(r => r.json())
      .then(d => setInventory(Array.isArray(d) ? d : (d.inventory || d.tickets || [])))
      .catch(() => setInventory([]));
  }

  function loadOrders() {
    const url = isInventoryOnly || !game.id
      ? `${API}/orders?game_name=${encodeURIComponent(game.name)}`
      : `${API}/games/${id}/orders`;
    fetch(url)
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : (d.orders || [])))
      .catch(() => setOrders([]));
  }

  function loadSummary() {
    fetch(`${API}/games/${id}/summary`)
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) {
          setSummary({
            total_revenue: d.total_revenue ?? 0,
            total_ticket_cost: d.total_ticket_cost ?? 0,
            eli_cost: d.eli_cost ?? 0,
            notes: d.notes ?? '',
          });
        }
      })
      .catch(() => {});
  }

  async function saveSummary() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/games/${id}/summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
      if (!res.ok) throw new Error('Failed to save');
      alert('Saved!');
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = isInventoryOnly || !game.id
        ? `${API}/games/summary/upload?game_name=${encodeURIComponent(game.name)}`
        : `${API}/games/${id}/summary/upload`;
      const res = await fetch(url, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (data.game_id && isInventoryOnly) {
        navigate(`/game/${data.game_id}`);
      } else {
        loadSummary();
        alert('Uploaded successfully!');
      }
    } catch (e) {
      alert('Upload error: ' + e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Inventory stats
  const totalTickets = inventory.length;
  const availableCount = inventory.filter(t => (t.status || '').toLowerCase() === 'available').length;
  const soldCount = inventory.filter(t => {
    const s = (t.status || '').toLowerCase();
    return s === 'sold' || s === 'delivered';
  }).length;
  const totalCost = inventory.reduce((sum, t) => sum + (Number(t.buy_price) || 0), 0);

  // Summary calcs
  const revenue = Number(summary.total_revenue) || 0;
  const ticketCost = Number(summary.total_ticket_cost) || 0;
  const eliCost = Number(summary.eli_cost) || 0;
  const netProfit = revenue - ticketCost - eliCost;
  const marginPct = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '—';

  const hasTickets = totalTickets > 0 || inventory.length > 0;

  if (loading) return <div style={{ padding: 40, color: '#6B7280' }}>Loading…</div>;
  if (error) return <div style={{ padding: 40, color: '#DC2626' }}>Error: {error}</div>;
  if (!game) return null;

  const displayName = game.name || gameName || 'Game';
  const displayDate = game.date
    ? new Date(game.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const tabs = [
    { key: 'inventory', label: '🎫 מלאי' },
    { key: 'orders', label: '📋 הזמנות' },
    { key: 'summary', label: '📊 סיכום' },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#111827' }}>{displayName}</h1>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: hasTickets ? '#1D9E75' : '#D1D5DB',
                display: 'inline-block', flexShrink: 0, marginTop: 2
              }} title={hasTickets ? 'Has tickets' : 'No tickets'} />
            </div>
            {displayDate && (
              <div style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>{displayDate}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: '1px solid #E5E7EB', borderRadius: 8,
            padding: '8px 16px', fontSize: 14, color: '#374151', cursor: 'pointer',
            fontWeight: 500
          }}
        >
          ← Dashboard
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 20px', borderRadius: 20, border: 'none',
              fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
              background: activeTab === tab.key ? '#1D9E75' : '#fff',
              color: activeTab === tab.key ? '#fff' : '#6B7280',
              boxShadow: activeTab === tab.key ? '0 2px 8px rgba(29,158,117,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: INVENTORY ─── */}
      {activeTab === 'inventory' && (
        <div>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            <StatCard label="סה״כ כרטיסים" value={totalTickets} />
            <StatCard label="זמינים" value={availableCount} />
            <StatCard label="נמכרו / הועברו" value={soldCount} />
            <StatCard label="עלות מלאי" value={fmt(totalCost)} />
          </div>

          {inventory.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
              padding: '48px 24px', textAlign: 'center', color: '#9CA3AF'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎫</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#6B7280' }}>אין כרטיסים במלאי</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>העלה קובץ Excel להוספת כרטיסים</div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['מושב', 'קטגוריה', 'סטטוס', 'מחיר רכישה', 'הזמנה'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((ticket, i) => (
                    <tr
                      key={ticket.id || i}
                      style={{ borderBottom: '1px solid #F3F4F6' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '10px 14px', color: '#111827', fontWeight: 500 }}>{ticket.seat || '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#6B7280' }}>{ticket.category || '—'}</td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge status={ticket.status} /></td>
                      <td style={{ padding: '10px 14px', color: '#111827' }}>{fmt(ticket.buy_price)}</td>
                      <td style={{ padding: '10px 14px', color: ticket.order_id ? '#1D9E75' : '#9CA3AF' }}>
                        {ticket.order_id ? `#${ticket.order_id}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: ORDERS ─── */}
      {activeTab === 'orders' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              onClick={() => navigate(`/orders?game=${encodeURIComponent(displayName)}`)}
              style={{
                background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer'
              }}
            >
              + הוסף הזמנה
            </button>
          </div>

          {orders.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
              padding: '48px 24px', textAlign: 'center', color: '#9CA3AF'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#6B7280', marginBottom: 16 }}>אין הזמנות למשחק זה</div>
              <button
                onClick={() => navigate(`/orders?game=${encodeURIComponent(displayName)}`)}
                style={{
                  background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer'
                }}
              >
                + הוסף הזמנה ראשונה
              </button>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['הזמנה #', 'קונה', 'ערוץ', 'סטטוס', 'פריטים', 'סה״כ', 'פעולות'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, i) => (
                    <tr
                      key={order.id || i}
                      style={{ borderBottom: '1px solid #F3F4F6' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1D9E75' }}>
                        {order.order_number ? `#${order.order_number}` : `#${order.id}`}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#111827' }}>{order.buyer_name || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {order.sales_channel ? (
                          <span style={{
                            background: '#F3F4F6', color: '#374151', borderRadius: 8,
                            padding: '2px 10px', fontSize: 12, fontWeight: 500
                          }}>
                            {order.sales_channel}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={order.status || 'Active'} />
                      </td>
                      <td style={{ padding: '10px 14px', color: '#6B7280' }}>
                        {order.item_count ?? order.items_count ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmt(order.total)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => navigate(`/orders?view=${order.id}`)}
                          style={{
                            background: 'none', border: '1px solid #E5E7EB', borderRadius: 6,
                            padding: '4px 12px', fontSize: 12, color: '#374151', cursor: 'pointer'
                          }}
                        >
                          צפה
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: SUMMARY ─── */}
      {activeTab === 'summary' && (
        <div>
          {isInventoryOnly ? (
            <div style={{
              background: '#fff', border: '2px dashed #D1D5DB', borderRadius: 14,
              padding: '48px 32px', textAlign: 'center'
            }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>📊</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                Upload CUSTOMER SERVICE Excel to create game summary
              </div>
              <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 24 }}>
                קובץ זה ייצור רשומת משחק מלאה עם סיכום כספי
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleUpload}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '11px 28px', fontWeight: 700, fontSize: 15, cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.7 : 1
                }}
              >
                {uploading ? 'Uploading…' : '⬆ Upload CUSTOMER SERVICE Excel'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

              {/* Editable fields */}
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: '#111827' }}>עריכת נתונים כספיים</div>

                {[
                  { key: 'total_revenue', label: 'הכנסה כוללת (€)' },
                  { key: 'total_ticket_cost', label: 'עלות כרטיסים (€)' },
                  { key: 'eli_cost', label: 'עלות Eli (€)' },
                ].map(({ key, label }) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      {label}
                    </label>
                    <input
                      type="number"
                      value={summary[key]}
                      onChange={e => setSummary(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '9px 12px',
                        border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14,
                        outline: 'none', color: '#111827'
                      }}
                    />
                  </div>
                ))}

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    הערות
                  </label>
                  <textarea
                    value={summary.notes}
                    onChange={e => setSummary(prev => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '9px 12px',
                      border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14,
                      resize: 'vertical', fontFamily: 'inherit', color: '#111827'
                    }}
                    placeholder="הוסף הערות…"
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={saveSummary}
                    disabled={saving}
                    style={{
                      background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 24px', fontWeight: 600, fontSize: 14,
                      cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1
                    }}
                  >
                    {saving ? 'Saving…' : '✓ Save'}
                  </button>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleUpload}
                      style={{ display: 'none' }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      style={{
                        background: '#fff', color: '#374151', border: '1px solid #E5E7EB',
                        borderRadius: 8, padding: '10px 16px', fontWeight: 600, fontSize: 14,
                        cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1
                      }}
                    >
                      {uploading ? 'Uploading…' : '⬆ Upload CUSTOMER SERVICE Excel'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Calculated display */}
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: '#111827' }}>סיכום מחושב</div>

                {[
                  { label: 'הכנסה', value: fmt(revenue) },
                  { label: 'עלות כרטיסים', value: fmt(ticketCost) },
                  { label: 'עלות Eli', value: fmt(eliCost) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <span style={{ fontSize: 14, color: '#6B7280' }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{value}</span>
                  </div>
                ))}

                <div style={{
                  display: 'flex', justifyContent: 'space-between', padding: '14px 0 6px',
                  borderTop: '2px solid #E5E7EB', marginTop: 4
                }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>רווח נקי</span>
                  <span style={{
                    fontSize: 18, fontWeight: 800,
                    color: netProfit >= 0 ? '#1D9E75' : '#DC2626'
                  }}>
                    {fmt(netProfit)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, color: '#9CA3AF' }}>מרווח %</span>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    color: netProfit >= 0 ? '#1D9E75' : '#DC2626'
                  }}>
                    {marginPct !== '—' ? `${marginPct}%` : '—'}
                  </span>
                </div>

                {/* Visual bar */}
                {revenue > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>פירוט הכנסה</div>
                    {[
                      { label: 'עלות כרטיסים', value: ticketCost, color: '#D85A30' },
                      { label: 'עלות Eli', value: eliCost, color: '#B45309' },
                      { label: 'רווח נקי', value: Math.max(netProfit, 0), color: '#1D9E75' },
                    ].map(item => {
                      const pct = Math.min(Math.max((item.value / revenue) * 100, 0), 100);
                      return (
                        <div key={item.label} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: '#6B7280' }}>{item.label}</span>
                            <span style={{ color: '#9CA3AF' }}>{pct.toFixed(1)}%</span>
                          </div>
                          <div style={{ background: '#F3F4F6', borderRadius: 4, height: 6 }}>
                            <div style={{ width: `${pct}%`, height: 6, borderRadius: 4, background: item.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
