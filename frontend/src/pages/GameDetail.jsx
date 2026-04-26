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
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState({ total_revenue: 0, total_ticket_cost: 0, eli_cost: 0, notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Order-inventory linking state
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState({});
  const [availableInv, setAvailableInv] = useState([]);
  const [showLinkPicker, setShowLinkPicker] = useState(null);
  const [linkSellPrice, setLinkSellPrice] = useState('');

  // Inline total_amount edit state
  const [editingTotal, setEditingTotal] = useState(null); // orderId
  const [editTotalValue, setEditTotalValue] = useState('');

  // Inventory tab: assign-to-order state
  const [assigningInventory, setAssigningInventory] = useState(null); // inventory item id
  const [assignOrderId, setAssignOrderId] = useState('');

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
          setGame({ name: gameName, date: null, id: null });
          setLoading(false);
        } else {
          setError(e.message);
          setLoading(false);
        }
      });
  }, [id, gameName, isInventoryOnly]);

  // Load inventory always on mount (needed for summary stats too)
  useEffect(() => {
    if (!game) return;
    loadInventory();
  }, [game]);

  // Load tickets when Tickets tab is active
  useEffect(() => {
    if (!game) return;
    if (activeTab !== 'tickets') return;
    loadTickets();
  }, [game, activeTab]);

  // Load orders always on mount (needed for summary stats too)
  useEffect(() => {
    if (!game) return;
    loadOrders();
  }, [game]);

  // Load summary when tab is active (games-table games only)
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

  function loadTickets() {
    const url = `${API}/inventory/tickets?game_name=${encodeURIComponent(game.name)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => setTickets(Array.isArray(d) ? d : []))
      .catch(() => setTickets([]));
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

  // Fetch items for a specific order
  async function fetchOrderItems(orderId) {
    try {
      const res = await fetch(`${API}/orders/${orderId}/items`);
      const data = await res.json();
      setOrderItems(prev => ({ ...prev, [orderId]: Array.isArray(data) ? data : (data.items || []) }));
    } catch {
      setOrderItems(prev => ({ ...prev, [orderId]: [] }));
    }
  }

  // Fetch available inventory for linking
  async function fetchAvailableInv() {
    if (!game) return;
    try {
      const res = await fetch(`${API}/inventory/available?game_name=${encodeURIComponent(game.name)}`);
      const data = await res.json();
      setAvailableInv(Array.isArray(data) ? data : (data.inventory || []));
    } catch {
      setAvailableInv([]);
    }
  }

  // Toggle order row expansion
  function toggleOrder(orderId) {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      setShowLinkPicker(null);
    } else {
      setExpandedOrder(orderId);
      setShowLinkPicker(null);
      fetchOrderItems(orderId);
    }
  }

  // Open link picker for an order
  function openLinkPicker(orderId) {
    setShowLinkPicker(orderId);
    setLinkSellPrice('');
    fetchAvailableInv();
  }

  // Link an inventory item to an order
  async function linkInventoryItem(orderId, inventoryId, sellPrice) {
    try {
      const body = { sell_price: Number(sellPrice) || 0 };
      if (inventoryId != null) body.inventory_id = inventoryId;
      await fetch(`${API}/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await fetchOrderItems(orderId);
      await fetchAvailableInv();
      loadInventory();
    } catch (e) {
      alert('Error linking item: ' + e.message);
    }
  }

  // Remove an order item
  async function removeOrderItem(orderId, itemId) {
    try {
      await fetch(`${API}/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
      await fetchOrderItems(orderId);
      loadInventory();
    } catch (e) {
      alert('Error removing item: ' + e.message);
    }
  }

  // Save inline total_amount for an order
  async function saveOrderTotal(orderId, value) {
    try {
      const res = await fetch(`${API}/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_amount: Number(value) || 0 }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, total_amount: updated.total_amount } : o));
    } catch (e) {
      alert('Error saving amount: ' + e.message);
    } finally {
      setEditingTotal(null);
    }
  }

  // Update sell_price on an order item
  async function updateItemSellPrice(orderId, itemId, newPrice) {
    try {
      await fetch(`${API}/orders/${orderId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sell_price: Number(newPrice) || 0 }),
      });
      await fetchOrderItems(orderId);
    } catch (e) {
      alert('Error updating price: ' + e.message);
    }
  }

  // Assign inventory item to order (from inventory tab)
  async function assignInventoryToOrder(inventoryItem, orderId) {
    if (!orderId) return;
    try {
      await fetch(`${API}/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory_id: inventoryItem.id, sell_price: 0 }),
      });
      loadInventory();
      setAssigningInventory(null);
      setAssignOrderId('');
    } catch (e) {
      alert('Error assigning item: ' + e.message);
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

  if (loading) return <div style={{ padding: 40, color: '#6B7280' }}>Loading…</div>;
  if (error) return <div style={{ padding: 40, color: '#DC2626' }}>Error: {error}</div>;
  if (!game) return null;

  const displayName = game.name || gameName || 'Game';
  const displayDate = game.date
    ? new Date(game.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const tabs = [
    { key: 'inventory', label: '🎫 Inventory' },
    { key: 'orders', label: '📋 Orders' },
    { key: 'tickets', label: '🪑 Tickets' },
    { key: 'summary', label: '📊 Summary' },
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
            <StatCard label="Total Tickets" value={totalTickets} />
            <StatCard label="Available" value={availableCount} />
            <StatCard label="Sold / Delivered" value={soldCount} />
            <StatCard label="Inventory Cost" value={fmt(totalCost)} />
          </div>

          {inventory.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
              padding: '48px 24px', textAlign: 'center', color: '#9CA3AF'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎫</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#6B7280' }}>No tickets in inventory</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Upload an Excel file to add tickets</div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['Seat', 'Category', 'Status', 'Buy Price', 'Order'].map(h => (
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
                      <td style={{ padding: '10px 14px' }}>
                        {ticket.order_id ? (
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                            fontSize: 12, fontWeight: 600, background: '#ECFDF5', color: '#065F46'
                          }}>
                            📋 Order #{ticket.order_id}
                          </span>
                        ) : assigningInventory === ticket.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                              value={assignOrderId}
                              onChange={e => setAssignOrderId(e.target.value)}
                              style={{
                                padding: '4px 8px', borderRadius: 6, border: '1px solid #D1D5DB',
                                fontSize: 13, color: '#111827', outline: 'none'
                              }}
                            >
                              <option value="">-- Select Order --</option>
                              {orders.map(o => (
                                <option key={o.id} value={o.id}>
                                  #{o.order_number || o.id} — {o.buyer_name || ''}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => assignInventoryToOrder(ticket, assignOrderId)}
                              disabled={!assignOrderId}
                              style={{
                                background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 6,
                                padding: '4px 10px', fontSize: 12, fontWeight: 600,
                                cursor: assignOrderId ? 'pointer' : 'not-allowed',
                                opacity: assignOrderId ? 1 : 0.5
                              }}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => { setAssigningInventory(null); setAssignOrderId(''); }}
                              style={{
                                background: 'none', border: '1px solid #E5E7EB', borderRadius: 6,
                                padding: '4px 8px', fontSize: 12, color: '#6B7280', cursor: 'pointer'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#9CA3AF', fontSize: 13 }}>— Unassigned</span>
                            {orders.length > 0 && (
                              <button
                                onClick={() => { setAssigningInventory(ticket.id); setAssignOrderId(''); }}
                                style={{
                                  background: 'none', border: '1px solid #1D9E75', borderRadius: 6,
                                  padding: '2px 8px', fontSize: 11, color: '#1D9E75',
                                  cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'
                                }}
                              >
                                + Assign to Order
                              </button>
                            )}
                          </div>
                        )}
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
              + Add Order
            </button>
          </div>

          {orders.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
              padding: '48px 24px', textAlign: 'center', color: '#9CA3AF'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#6B7280', marginBottom: 16 }}>No orders for this game</div>
              <button
                onClick={() => navigate(`/orders?game=${encodeURIComponent(displayName)}`)}
                style={{
                  background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer'
                }}
              >
                + Add First Order
              </button>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ padding: '10px 8px', width: 28 }} />
                    {['Order #', 'Buyer', 'Channel', 'Status', 'Items', 'Total', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, i) => {
                    const isExpanded = expandedOrder === order.id;
                    const items = orderItems[order.id] || [];
                    const isPickerOpen = showLinkPicker === order.id;

                    return (
                      <>
                        {/* Main order row */}
                        <tr
                          key={order.id || i}
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid #F3F4F6',
                            cursor: 'pointer',
                            background: isExpanded ? '#F0FDF9' : undefined,
                          }}
                          onClick={() => toggleOrder(order.id)}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#F9FAFB'; }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                        >
                          {/* Expand arrow */}
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.15s',
                              fontSize: 11,
                              color: '#9CA3AF',
                            }}>
                              ▶
                            </span>
                          </td>
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
                          <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                            {editingTotal === order.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 13, color: '#6B7280' }}>€</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editTotalValue}
                                  onChange={e => setEditTotalValue(e.target.value)}
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveOrderTotal(order.id, editTotalValue);
                                    if (e.key === 'Escape') setEditingTotal(null);
                                  }}
                                  style={{
                                    width: 80, padding: '3px 7px', borderRadius: 5,
                                    border: '1px solid #1D9E75', fontSize: 13,
                                    color: '#111827', outline: 'none'
                                  }}
                                />
                                <button
                                  onClick={() => saveOrderTotal(order.id, editTotalValue)}
                                  style={{
                                    background: '#1D9E75', color: '#fff', border: 'none',
                                    borderRadius: 5, padding: '3px 8px', fontSize: 12,
                                    fontWeight: 700, cursor: 'pointer'
                                  }}
                                >✓</button>
                                <button
                                  onClick={() => setEditingTotal(null)}
                                  style={{
                                    background: 'none', border: '1px solid #E5E7EB',
                                    borderRadius: 5, padding: '3px 7px', fontSize: 12,
                                    color: '#6B7280', cursor: 'pointer'
                                  }}
                                >✕</button>
                              </div>
                            ) : (
                              <div
                                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                                onClick={() => {
                                  setEditingTotal(order.id);
                                  setEditTotalValue(order.total_amount || '');
                                }}
                                title="Click to edit amount"
                              >
                                <span style={{ fontWeight: 600 }}>
                                  {order.total_amount ? fmt(order.total_amount) : <span style={{ color: '#D1D5DB' }}>— set amount</span>}
                                </span>
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>✏</span>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/orders?view=${order.id}`)}
                              style={{
                                background: 'none', border: '1px solid #E5E7EB', borderRadius: 6,
                                padding: '4px 12px', fontSize: 12, color: '#374151', cursor: 'pointer'
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>

                        {/* Expanded sub-rows */}
                        {isExpanded && (
                          <tr key={`${order.id}-expanded`} style={{ borderBottom: '1px solid #E5E7EB' }}>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div style={{
                                background: '#F8FFFE',
                                borderLeft: '3px solid #1D9E75',
                                margin: '0 0 0 8px',
                                padding: '12px 16px 16px',
                              }}>
                                {/* Linked tickets sub-table */}
                                {items.length > 0 ? (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid #D1FAE5' }}>
                                        {['Seat', 'Category', 'Status', 'Sell Price', ''].map(h => (
                                          <th key={h} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#065F46', fontSize: 12 }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((item, idx) => (
                                        <OrderItemRow
                                          key={item.id || idx}
                                          item={item}
                                          orderId={order.id}
                                          onRemove={removeOrderItem}
                                          onSellPriceChange={updateItemSellPrice}
                                        />
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 12 }}>
                                    No tickets linked to this order yet.
                                  </div>
                                )}

                                {/* Link Ticket button */}
                                {!isPickerOpen ? (
                                  <button
                                    onClick={e => { e.stopPropagation(); openLinkPicker(order.id); }}
                                    style={{
                                      background: '#ECFDF5', color: '#1D9E75', border: '1px solid #1D9E75',
                                      borderRadius: 7, padding: '6px 14px', fontSize: 13,
                                      fontWeight: 600, cursor: 'pointer'
                                    }}
                                  >
                                    🔗 Link Ticket from Inventory
                                  </button>
                                ) : (
                                  /* Inline link picker */
                                  <div
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                      background: '#fff', border: '1px solid #D1FAE5', borderRadius: 10,
                                      padding: '14px 16px', marginTop: 4
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                      <span style={{ fontWeight: 700, fontSize: 13, color: '#065F46' }}>
                                        🔗 Link Inventory Ticket
                                      </span>
                                      <button
                                        onClick={() => setShowLinkPicker(null)}
                                        style={{
                                          background: 'none', border: 'none', fontSize: 16,
                                          color: '#9CA3AF', cursor: 'pointer', lineHeight: 1
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>

                                    {availableInv.length === 0 ? (
                                      <div style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 10 }}>
                                        No available inventory for this game.
                                      </div>
                                    ) : (
                                      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
                                        {availableInv.map((inv, idx) => (
                                          <div
                                            key={inv.id || idx}
                                            style={{
                                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                              padding: '7px 10px', borderRadius: 7, marginBottom: 4,
                                              background: '#F0FDF9', border: '1px solid #D1FAE5', gap: 8
                                            }}
                                          >
                                            <span style={{ fontSize: 13, color: '#111827', flex: 1 }}>
                                              Seat: <strong>{inv.seat || '—'}</strong>
                                              {' | '}Cat: <strong>{inv.category || '—'}</strong>
                                              {' | '}{fmt(inv.buy_price)}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <span style={{ fontSize: 12, color: '#6B7280' }}>Sell €</span>
                                              <input
                                                type="number"
                                                placeholder="0"
                                                value={linkSellPrice}
                                                onChange={e => setLinkSellPrice(e.target.value)}
                                                onClick={e => e.stopPropagation()}
                                                style={{
                                                  width: 70, padding: '3px 7px', borderRadius: 5,
                                                  border: '1px solid #D1D5DB', fontSize: 13, color: '#111827', outline: 'none'
                                                }}
                                              />
                                              <button
                                                onClick={() => linkInventoryItem(order.id, inv.id, linkSellPrice)}
                                                style={{
                                                  background: '#1D9E75', color: '#fff', border: 'none',
                                                  borderRadius: 6, padding: '4px 12px', fontSize: 12,
                                                  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                                                }}
                                              >
                                                Assign
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Add placeholder (no seat) */}
                                    <div style={{
                                      display: 'flex', alignItems: 'center', gap: 8,
                                      paddingTop: 8, borderTop: '1px solid #E5E7EB'
                                    }}>
                                      <span style={{ fontSize: 13, color: '#6B7280', flex: 1 }}>
                                        + Add placeholder (no seat yet)
                                      </span>
                                      <span style={{ fontSize: 12, color: '#6B7280' }}>Sell €</span>
                                      <input
                                        type="number"
                                        placeholder="0"
                                        value={linkSellPrice}
                                        onChange={e => setLinkSellPrice(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                          width: 70, padding: '3px 7px', borderRadius: 5,
                                          border: '1px solid #D1D5DB', fontSize: 13, color: '#111827', outline: 'none'
                                        }}
                                      />
                                      <button
                                        onClick={() => linkInventoryItem(order.id, null, linkSellPrice)}
                                        style={{
                                          background: '#6B7280', color: '#fff', border: 'none',
                                          borderRadius: 6, padding: '4px 12px', fontSize: 12,
                                          fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                                        }}
                                      >
                                        Add
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: TICKETS ─── */}
      {activeTab === 'tickets' && (
        <div>
          {/* Stats row */}
          {(() => {
            const total = tickets.length;
            const sold = tickets.filter(t => t.order_id).length;
            const unsold = total - sold;
            const totalBuy = tickets.reduce((s, t) => s + (Number(t.buy_price) || 0), 0);
            const totalSell = tickets.reduce((s, t) => {
              if (!t.order_id) return s;
              // use sell_price from order_items if available, else share of order total
              if (t.sell_price) return s + Number(t.sell_price);
              if (t.total_amount && t.ticket_quantity) return s + Number(t.total_amount) / Number(t.ticket_quantity);
              return s;
            }, 0);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
                <StatCard label="Total Tickets" value={total} />
                <StatCard label="Sold" value={sold} />
                <StatCard label="Unsold" value={unsold} />
                <StatCard label="Total Cost" value={fmt(totalBuy)} />
              </div>
            );
          })()}

          {tickets.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
              padding: '48px 24px', textAlign: 'center', color: '#9CA3AF'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🪑</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#6B7280' }}>No tickets in inventory</div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                    {['Seat', 'Category', 'Member #', 'Buy Price', 'Status', 'Order #', 'Buyer', 'SOLD'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t, i) => {
                    const isSold = !!t.order_id;
                    const sellAmt = t.sell_price
                      ? Number(t.sell_price)
                      : (t.total_amount && t.ticket_quantity ? Number(t.total_amount) / Number(t.ticket_quantity) : null);
                    return (
                      <tr
                        key={t.id || i}
                        style={{
                          borderBottom: '1px solid #F3F4F6',
                          background: isSold ? '#F0FDF9' : undefined,
                        }}
                      >
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#111827', fontFamily: 'monospace', fontSize: 13 }}>
                          {t.seat || '—'}
                        </td>
                        <td style={{ padding: '9px 12px', color: '#6B7280' }}>{t.category || '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#9CA3AF', fontSize: 12 }}>{t.member_number || '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#374151' }}>{fmt(t.buy_price)}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <StatusBadge status={t.status} />
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {t.order_number ? (
                            <span style={{ fontWeight: 600, color: '#1D9E75', fontSize: 12 }}>#{t.order_number}</span>
                          ) : (
                            <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', maxWidth: 200 }}>
                          {t.buyer_email ? (
                            <div>
                              {t.buyer_name && (
                                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.buyer_name}</div>
                              )}
                              <div style={{ fontSize: 11, color: '#9CA3AF', wordBreak: 'break-all' }}>{t.buyer_email}</div>
                            </div>
                          ) : (
                            <span style={{ color: '#D1D5DB', fontSize: 12 }}>Unsold</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {sellAmt != null ? (
                            <span style={{ fontWeight: 700, color: '#1D9E75' }}>{fmt(sellAmt)}</span>
                          ) : (
                            <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: SUMMARY ─── */}
      {activeTab === 'summary' && (
        <div>
          {isInventoryOnly ? (
            <div>
              {/* Computed stats from inventory + orders */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
                <StatCard label="Total Tickets" value={totalTickets} />
                <StatCard label="Inventory Cost" value={fmt(totalCost)} />
                <StatCard label="Orders" value={orders.length} />
                <StatCard
                  label="Net Profit"
                  value={(() => {
                    const rev = orders.reduce((s, o) => s + (Number(o.items_total) || Number(o.total_amount) || 0), 0);
                    const profit = rev - totalCost;
                    return fmt(profit);
                  })()}
                />
              </div>

              {/* Revenue from orders */}
              {orders.length > 0 && (() => {
                const rev = orders.reduce((s, o) => s + (Number(o.items_total) || Number(o.total_amount) || 0), 0);
                const profit = rev - totalCost;
                const margin = rev > 0 ? ((profit / rev) * 100).toFixed(1) : null;
                return (
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Financial Summary</div>
                    {[
                      { label: 'Total Revenue (from orders)', value: fmt(rev), color: '#16a34a' },
                      { label: 'Inventory Cost', value: fmt(totalCost), color: '#dc2626' },
                      { label: 'Net Profit', value: fmt(profit), color: profit >= 0 ? '#1D9E75' : '#dc2626', bold: true },
                      ...(margin ? [{ label: 'Margin', value: `${margin}%`, color: profit >= 0 ? '#1D9E75' : '#dc2626' }] : []),
                    ].map(({ label, value, color, bold }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
                        <span style={{ fontSize: 14, color: '#6B7280' }}>{label}</span>
                        <span style={{ fontSize: 14, fontWeight: bold ? 700 : 600, color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Upload CTA */}
              <div style={{ background: '#F8FAFC', border: '2px dashed #D1D5DB', borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>
                  Upload a CUSTOMER SERVICE Excel tab to create a full game record with detailed financial data
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: 'none' }} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: uploading ? 'not-allowed' : 'pointer',
                    opacity: uploading ? 0.7 : 1
                  }}
                >
                  {uploading ? 'Uploading…' : '⬆ Upload CUSTOMER SERVICE Excel'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

              {/* Editable fields */}
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: '#111827' }}>Edit Financial Data</div>

                {[
                  { key: 'total_revenue', label: 'Total Revenue (€)' },
                  { key: 'total_ticket_cost', label: 'Ticket Cost (€)' },
                  { key: 'eli_cost', label: 'Eli Cost (€)' },
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
                    Notes
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
                    placeholder="Add notes…"
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
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: '#111827' }}>Calculated Summary</div>

                {[
                  { label: 'Revenue', value: fmt(revenue) },
                  { label: 'Ticket Cost', value: fmt(ticketCost) },
                  { label: 'Eli Cost', value: fmt(eliCost) },
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
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Net Profit</span>
                  <span style={{
                    fontSize: 18, fontWeight: 800,
                    color: netProfit >= 0 ? '#1D9E75' : '#DC2626'
                  }}>
                    {fmt(netProfit)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, color: '#9CA3AF' }}>Margin %</span>
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
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>Revenue Breakdown</div>
                    {[
                      { label: 'Ticket Cost', value: ticketCost, color: '#D85A30' },
                      { label: 'Eli Cost', value: eliCost, color: '#B45309' },
                      { label: 'Net Profit', value: Math.max(netProfit, 0), color: '#1D9E75' },
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

// Sub-component for editable order item row
function OrderItemRow({ item, orderId, onRemove, onSellPriceChange }) {
  const [localPrice, setLocalPrice] = useState(item.sell_price ?? '');

  function handleBlur() {
    const parsed = Number(localPrice);
    if (parsed !== Number(item.sell_price ?? 0)) {
      onSellPriceChange(orderId, item.id, localPrice);
    }
  }

  return (
    <tr style={{ borderBottom: '1px solid #D1FAE5' }}>
      <td style={{ padding: '6px 10px', color: '#111827', fontWeight: 500 }}>{item.seat || '—'}</td>
      <td style={{ padding: '6px 10px', color: '#6B7280' }}>{item.category || '—'}</td>
      <td style={{ padding: '6px 10px' }}><StatusBadge status={item.status} /></td>
      <td style={{ padding: '6px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>€</span>
          <input
            type="number"
            value={localPrice}
            onChange={e => setLocalPrice(e.target.value)}
            onBlur={handleBlur}
            style={{
              width: 75, padding: '3px 7px', borderRadius: 5,
              border: '1px solid #D1D5DB', fontSize: 13, color: '#111827', outline: 'none'
            }}
          />
        </div>
      </td>
      <td style={{ padding: '6px 10px' }}>
        <button
          onClick={() => onRemove(orderId, item.id)}
          title="Remove"
          style={{
            background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
            borderRadius: 6, padding: '3px 9px', fontSize: 12, cursor: 'pointer', fontWeight: 600
          }}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
