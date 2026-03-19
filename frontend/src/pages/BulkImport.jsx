import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API = '/api';

export default function BulkImport() {
  const navigate = useNavigate();
  const fileRef  = useRef();
  const [file, setFile]         = useState(null);
  const [drag, setDrag]         = useState(false);
  const [gameName, setGameName] = useState('');
  const [gameDate, setGameDate] = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  // Auto-parse filename when file is selected
  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);

    const name = f.name.replace(/\.xlsx?$/i, '');
    const dateMatch = name.match(/(\d{2})[_\-\.](\d{2})[_\-\.](\d{4})/);
    if (dateMatch) {
      setGameDate(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`);
      let gn = name.replace(dateMatch[0], '').replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();
      const compMatch = name.match(/\d{2}[_\-\.]\d{2}[_\-\.]\d{4}\s*-\s*(.+)/);
      if (compMatch) gn = gn + ' - ' + compMatch[1].trim();
      setGameName(gn);
    } else {
      setGameName(name);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a file');
    if (!gameName.trim()) return setError('Game name is required');

    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('game_name', gameName.trim());
      if (gameDate) fd.append('game_date', gameDate);

      const res  = await fetch(`${API}/inventory/bulk-import`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate('/inventory')}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>
          ← Inventory
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Bulk Import Tickets</h1>
      </div>

      {result ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>
            {result.inserted} tickets imported
          </div>
          <div style={{ color: '#6b7280', marginBottom: 4 }}>{result.game_name}</div>
          {result.game_date && <div style={{ color: '#6b7280', marginBottom: 20 }}>{result.game_date}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => { setResult(null); setFile(null); setGameName(''); setGameDate(''); }}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 500 }}>
              Import Another
            </button>
            <button onClick={() => navigate('/inventory')}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
              View Inventory
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${drag ? '#1D9E75' : file ? '#1D9E75' : '#d1d5db'}`,
              borderRadius: 12,
              padding: 36,
              textAlign: 'center',
              cursor: 'pointer',
              background: drag ? '#f0fdf4' : file ? '#f0fdf4' : '#fafafa',
              marginBottom: 20,
              transition: 'all .2s',
            }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 36, marginBottom: 8 }}>{file ? '📋' : '📁'}</div>
            {file ? (
              <>
                <div style={{ fontWeight: 600, color: '#111827' }}>{file.name}</div>
                <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Click to change file</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: '#374151' }}>Drop Excel file here</div>
                <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>or click to browse — .xlsx / .xls</div>
              </>
            )}
          </div>

          {/* Game name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>
              Game Name *
            </label>
            <input
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="e.g. Manchester City VS Liverpool - FA CUP"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
              required
            />
          </div>

          {/* Date */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' }}>
              Date
            </label>
            <input
              type="date"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          {/* What gets imported */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 13, color: '#475569' }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: '#1e293b' }}>Fields imported from "Tickets" sheet:</div>
            <div>• <b>Member Number</b> — seat owner</div>
            <div>• <b>Seat</b> — block-row-seat (e.g. 007-18-179)</div>
            <div>• <b>Category (CAT)</b> — if present</div>
            <div>• <b>Price in EUR</b> — buy cost</div>
            <div>• <b>Note</b> — any notes</div>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !file}
            style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: loading || !file ? '#9ca3af' : '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 15, cursor: loading || !file ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Importing...' : 'Import Tickets'}
          </button>
        </form>
      )}
    </div>
  );
}
