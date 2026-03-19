import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function UploadGame() {
  const navigate = useNavigate();
  const fileInputRef = useRef();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ name: '', date: '' });
  const [extraCosts, setExtraCosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('Only Excel (.xlsx/.xls) or CSV files are allowed.');
      return;
    }
    setFile(f);
    setError(null);
    // Pre-fill game name from filename
    if (!form.name) {
      const base = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      setForm(prev => ({ ...prev, name: base }));
    }
  };

  const addCostRow = () => setExtraCosts(prev => [...prev, { label: '', amount: '' }]);

  const updateCost = (i, field, val) =>
    setExtraCosts(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));

  const removeCost = (i) => setExtraCosts(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    if (!form.name.trim()) { setError('Game name is required.'); return; }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', form.name.trim());
    formData.append('date', form.date);
    formData.append('tabName', 'CUSTOMER SERVICE');
    formData.append('extraCosts', JSON.stringify(
      extraCosts.filter(c => c.label.trim())
    ));

    try {
      const res = await fetch('/api/games/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      navigate(`/game/${data.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Add New Game</div>
          <div className="page-subtitle">Upload an Excel or CSV file to analyze profitability</div>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* File Drop Zone */}
        <div className="card card-body" style={{ marginBottom: 20 }}>
          <div
            className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            {file ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                <p><strong>{file.name}</strong></p>
                <p style={{ fontSize: 12, marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </p>
              </>
            ) : (
              <>
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px' }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p><strong>Click to upload</strong> or drag & drop</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Excel (.xlsx, .xls) or CSV</p>
              </>
            )}
          </div>
        </div>

        {/* Game Info */}
        <div className="card card-body" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Game Information</div>
          <div className="form-group">
            <label>Game Name *</label>
            <input
              type="text"
              placeholder="e.g. Barcelona vs Real Madrid"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
            />
          </div>
        </div>

        {/* Extra Costs */}
        <div className="card card-body" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Extra Costs</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addCostRow}>
              + Add Cost
            </button>
          </div>
          {extraCosts.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No extra costs yet. Click "+ Add Cost" to add marketing fees, transport, etc.
            </div>
          )}
          {extraCosts.map((cost, i) => (
            <div className="cost-row" key={i}>
              <input
                type="text"
                placeholder="Label (e.g. Transport)"
                value={cost.label}
                onChange={e => updateCost(i, 'label', e.target.value)}
              />
              <input
                type="number"
                className="amount"
                placeholder="€ Amount"
                value={cost.amount}
                min="0"
                step="0.01"
                onChange={e => updateCost(i, 'amount', e.target.value)}
              />
              <button type="button" className="btn btn-sm btn-danger" onClick={() => removeCost(i)}>×</button>
            </div>
          ))}
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
          {loading ? 'Analyzing…' : '📊 Upload & Analyze'}
        </button>
      </form>
    </div>
  );
}
