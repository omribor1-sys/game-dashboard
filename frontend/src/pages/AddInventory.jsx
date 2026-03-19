import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUSES = ['Available', 'Reserved', 'Sold', 'Delivered', 'Cancelled'];
const CATEGORIES = ['Standard', 'VIP', 'Premium', 'Student', 'Season', 'Hospitality', 'Other'];

const EMPTY_ITEM = {
  game_name: '',
  game_date: '',
  section: '',
  seat: '',
  category: 'Standard',
  buy_price: '',
  sell_price: '',
  status: 'Available',
  notes: '',
};

export default function AddInventory() {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  const [item, setItem] = useState(EMPTY_ITEM);
  const [bulk, setBulk] = useState([{ ...EMPTY_ITEM }, { ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Load games for the dropdown ──────────────────────────────────────────
  useEffect(() => {
    fetch('/api/games')
      .then(r => r.json())
      .then(d => setGames(d.games || []))
      .catch(() => {});
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function handleGameSelect(gameName, date, setter) {
    setter(prev => ({
      ...prev,
      game_name: gameName,
      game_date: date || '',
    }));
  }

  function updateField(setter, field, value) {
    setter(prev => ({ ...prev, [field]: value }));
  }

  function updateBulkRow(index, field, value) {
    setBulk(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addBulkRow() {
    setBulk(prev => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeBulkRow(index) {
    setBulk(prev => prev.filter((_, i) => i !== index));
  }

  function validate(items) {
    for (const it of items) {
      if (!it.game_name.trim()) return 'Game name is required for all rows';
    }
    return null;
  }

  async function saveItems(items) {
    setSaving(true);
    setError('');
    setSuccess('');
    const validationError = validate(items);
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    try {
      const results = await Promise.all(
        items.map(it =>
          fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...it,
              game_name:  it.game_name.trim(),
              buy_price:  parseFloat(it.buy_price)  || 0,
              sell_price: parseFloat(it.sell_price) || 0,
            }),
          }).then(r => r.json())
        )
      );

      const failed = results.find(r => r.error);
      if (failed) throw new Error(failed.error);

      setSuccess(`${items.length} ticket${items.length !== 1 ? 's' : ''} added successfully.`);
      if (mode === 'single') {
        setItem(EMPTY_ITEM);
      } else {
        setBulk([{ ...EMPTY_ITEM }, { ...EMPTY_ITEM }]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function GameSelector({ value, dateValue, onChange }) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
          <select
            value=""
            onChange={e => {
              const g = games.find(g => String(g.id) === e.target.value);
              if (g) onChange(g.name, g.date);
            }}
          >
            <option value="">— Link to existing game —</option>
            {games.map(g => (
              <option key={g.id} value={g.id}>{g.name} {g.date ? `(${g.date})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 3, marginBottom: 0 }}>
          <input
            type="text"
            placeholder="or type game name *"
            value={value}
            onChange={e => onChange(e.target.value, dateValue)}
          />
        </div>
      </div>
    );
  }

  function ItemForm({ data, setter }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        <div className="form-group" style={{ gridColumn: '1/-1', marginBottom: 0 }}>
          <label>Game Name *</label>
          <GameSelector
            value={data.game_name}
            dateValue={data.game_date}
            onChange={(name, date) => handleGameSelect(name, date, setter)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Game Date</label>
          <input
            type="date"
            value={data.game_date}
            onChange={e => updateField(setter, 'game_date', e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Section</label>
          <input
            type="text"
            placeholder="e.g. North Stand"
            value={data.section}
            onChange={e => updateField(setter, 'section', e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Seat</label>
          <input
            type="text"
            placeholder="e.g. Row 4, Seat 12"
            value={data.seat}
            onChange={e => updateField(setter, 'seat', e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Category</label>
          <select
            value={data.category}
            onChange={e => updateField(setter, 'category', e.target.value)}
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Buy Price (€)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={data.buy_price}
            onChange={e => updateField(setter, 'buy_price', e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Sell Price (€)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={data.sell_price}
            onChange={e => updateField(setter, 'sell_price', e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Status</label>
          <select
            value={data.status}
            onChange={e => updateField(setter, 'status', e.target.value)}
          >
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ gridColumn: '1/-1', marginBottom: 0 }}>
          <label>Notes</label>
          <input
            type="text"
            placeholder="Optional notes"
            value={data.notes}
            onChange={e => updateField(setter, 'notes', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ── Bulk row (compact) ────────────────────────────────────────────────────
  function BulkRow({ data, index }) {
    function upd(field, value) { updateBulkRow(index, field, value); }

    return (
      <tr>
        <td>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              value=""
              onChange={e => {
                const g = games.find(g => String(g.id) === e.target.value);
                if (g) { upd('game_name', g.name); upd('game_date', g.date || ''); }
              }}
            >
              <option value="">— link game —</option>
              {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input
              style={{ flex: 2, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              placeholder="Game name *"
              value={data.game_name}
              onChange={e => upd('game_name', e.target.value)}
            />
          </div>
        </td>
        <td>
          <input
            style={cellInput}
            type="date"
            value={data.game_date}
            onChange={e => upd('game_date', e.target.value)}
          />
        </td>
        <td>
          <input
            style={cellInput}
            placeholder="Section"
            value={data.section}
            onChange={e => upd('section', e.target.value)}
          />
        </td>
        <td>
          <input
            style={cellInput}
            placeholder="Seat"
            value={data.seat}
            onChange={e => upd('seat', e.target.value)}
          />
        </td>
        <td>
          <select
            style={cellInput}
            value={data.category}
            onChange={e => upd('category', e.target.value)}
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </td>
        <td>
          <input
            style={{ ...cellInput, width: 80 }}
            type="number" min="0" step="0.01" placeholder="0.00"
            value={data.buy_price}
            onChange={e => upd('buy_price', e.target.value)}
          />
        </td>
        <td>
          <input
            style={{ ...cellInput, width: 80 }}
            type="number" min="0" step="0.01" placeholder="0.00"
            value={data.sell_price}
            onChange={e => upd('sell_price', e.target.value)}
          />
        </td>
        <td>
          <select style={cellInput} value={data.status} onChange={e => upd('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </td>
        <td>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => removeBulkRow(index)}
            disabled={bulk.length <= 1}
            title="Remove row"
          >✕</button>
        </td>
      </tr>
    );
  }

  const cellInput = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Add Inventory</div>
          <div className="page-subtitle">Add single or multiple tickets to your inventory</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/inventory')}>
            Cancel
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="tabs">
        <button className={`tab-btn ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
          Single Ticket
        </button>
        <button className={`tab-btn ${mode === 'bulk' ? 'active' : ''}`} onClick={() => setMode('bulk')}>
          Bulk Entry
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && (
        <div style={{ background: 'var(--green-light)', color: 'var(--green)', padding: '14px 18px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {success} <button className="btn btn-sm btn-ghost" style={{ marginLeft: 12 }} onClick={() => navigate('/inventory')}>View Inventory</button>
        </div>
      )}

      {mode === 'single' ? (
        <div className="card">
          <div className="card-body">
            <ItemForm data={item} setter={setItem} />
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setItem(EMPTY_ITEM)}>Reset</button>
              <button
                className="btn btn-primary"
                onClick={() => saveItems([item])}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Add Ticket'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 260 }}>Game Name</th>
                    <th style={{ minWidth: 120 }}>Date</th>
                    <th style={{ minWidth: 110 }}>Section</th>
                    <th style={{ minWidth: 110 }}>Seat</th>
                    <th style={{ minWidth: 110 }}>Category</th>
                    <th style={{ minWidth: 90 }}>Buy €</th>
                    <th style={{ minWidth: 90 }}>Sell €</th>
                    <th style={{ minWidth: 110 }}>Status</th>
                    <th style={{ width: 48 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {bulk.map((row, i) => (
                    <BulkRow key={i} data={row} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost btn-sm" onClick={addBulkRow}>
                + Add Row
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setBulk([{ ...EMPTY_ITEM }, { ...EMPTY_ITEM }])}>Reset</button>
                <button
                  className="btn btn-primary"
                  onClick={() => saveItems(bulk)}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : `Add ${bulk.length} Ticket${bulk.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
