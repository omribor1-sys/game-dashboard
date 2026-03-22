import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API = '/api';

const STEP = { SELECT: 1, PREVIEW: 2, SUCCESS: 3 };

export default function BulkImport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileRef = useRef();

  const [step, setStep]         = useState(STEP.SELECT);
  const [file, setFile]         = useState(null);
  const [drag, setDrag]         = useState(false);
  const [preview, setPreview]   = useState(null);
  const [gameName, setGameName] = useState(searchParams.get('game') || '');
  const [gameDate, setGameDate] = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  const handleFile = async (f) => {
    if (!f || !f.name.match(/\.xlsx?$/i)) {
      setError('Please select an Excel file (.xlsx or .xls)');
      return;
    }
    setFile(f);
    setError('');
    setPreview(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${API}/inventory/parse-preview`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not analyze file');
      setPreview(data);
      if (data.detected_game_name) setGameName(data.detected_game_name);
      if (data.detected_game_date) setGameDate(data.detected_game_date);
      setStep(STEP.PREVIEW);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const onImport = async () => {
    if (!gameName.trim()) { setError('Game name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('game_name', gameName.trim());
      if (gameDate) fd.append('game_date', gameDate);
      const res = await fetch(`${API}/inventory/bulk-import`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
      setStep(STEP.SUCCESS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(STEP.SELECT);
    setFile(null);
    setPreview(null);
    setResult(null);
    setGameName('');
    setGameDate('');
    setError('');
  };

  const card = { background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
  const label = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#374151' };
  const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate('/inventory')}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>
          ← Inventory
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Bulk Import Tickets</h1>
        {/* Step indicator */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#9ca3af' }}>
          {['Select', 'Preview', 'Done'].map((s, i) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span>›</span>}
              <span style={{ fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? '#1D9E75' : step > i + 1 ? '#6b7280' : '#d1d5db' }}>
                {step > i + 1 ? '✓' : ''}{s}
              </span>
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* STEP 1: Select file */}
      {step === STEP.SELECT && (
        <div style={card}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${drag ? '#1D9E75' : '#d1d5db'}`,
              borderRadius: 12, padding: 48, textAlign: 'center', cursor: 'pointer',
              background: drag ? '#f0fdf4' : '#fafafa', transition: 'all .2s',
            }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])} />
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: 16 }}>
              {loading ? 'Analyzing...' : 'Drop Excel file here'}
            </div>
            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>
              or click to browse — .xlsx / .xls
            </div>
          </div>

          <div style={{ marginTop: 20, padding: '14px 16px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#64748b' }}>
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8 }}>📋 Expected columns in "Tickets" sheet:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              <div>• <b>MEMBER NUMBER</b> — seat owner</div>
              <div>• <b>SEAT</b> — e.g. 549-32-297</div>
              <div>• <b>CAT</b> — ticket category</div>
              <div>• <b>PRICE IN EUR</b> — buy cost</div>
              <div>• <b>Notes</b> — optional notes</div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Preview */}
      {step === STEP.PREVIEW && preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* File info */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>📊</span>
              <div>
                <div style={{ fontWeight: 600 }}>{preview.filename}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Sheet: <b>{preview.sheet_used}</b> · {preview.total_rows} rows</div>
              </div>
              <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#6b7280' }}>
                Change File
              </button>
            </div>

            {/* Column mapping */}
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 8 }}>Column Mapping:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(preview.column_mapping).map(([field, col]) => (
                  <span key={field} style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    background: col ? '#dcfce7' : '#fef2f2',
                    color: col ? '#166534' : '#991b1b',
                    border: `1px solid ${col ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {col ? `✓ ${field} ← "${col.col_name}"` : `✗ ${field} — not found`}
                  </span>
                ))}
              </div>
            </div>

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                {preview.warnings.map((w, i) => (
                  <div key={i} style={{ color: w.type === 'from_notes' ? '#1d4ed8' : '#92400e', marginBottom: 4 }}>
                    {w.type === 'from_notes' ? '💡' : w.type === 'missing' ? '❌' : '⚠️'} {w.message}
                    {w.categories && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(w.categories).map(([cat, count]) => (
                          <span key={cat} style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>
                            {cat}: {count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Price summary */}
            {preview.price_summary && (
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>€{preview.price_summary.total_cost?.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Total Cost</div>
                </div>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>€{preview.price_summary.avg_price?.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Avg Price</div>
                </div>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{preview.total_rows}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Tickets</div>
                </div>
              </div>
            )}
          </div>

          {/* Sample rows */}
          {preview.sample && preview.sample.length > 0 && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Sample Rows (first 5):</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Member #', 'Seat', 'Category', 'Price (EUR)', 'Notes'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '7px 10px', color: '#6b7280' }}>{row.member_number || '—'}</td>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 12 }}>{row.seat || '—'}</td>
                        <td style={{ padding: '7px 10px' }}>{row.category || <span style={{ color: '#d1d5db' }}>null</span>}</td>
                        <td style={{ padding: '7px 10px', color: '#16a34a', fontWeight: 500 }}>€{row.buy_price?.toFixed(2) || '0'}</td>
                        <td style={{ padding: '7px 10px', color: '#6b7280', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Game name & date (editable) */}
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Game Details</div>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Game Name *</label>
              <input value={gameName} onChange={e => setGameName(e.target.value)}
                placeholder="e.g. Manchester City VS Arsenal CARABAO CUP"
                style={input} />
            </div>
            <div>
              <label style={label}>Date</label>
              <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} style={input} />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reset}
              style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 500 }}>
              ← Back
            </button>
            <button onClick={onImport} disabled={loading || !gameName.trim()}
              style={{ flex: 3, padding: '12px', borderRadius: 8, border: 'none', background: loading ? '#9ca3af' : '#1D9E75', color: '#fff', fontWeight: 600, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Importing...' : `✅ Import ${preview.total_rows} Tickets`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Success */}
      {step === STEP.SUCCESS && result && (
        <div style={card}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{result.inserted} tickets imported!</div>
            <div style={{ color: '#6b7280', marginTop: 4 }}>{result.game_name}</div>
            {result.game_date && <div style={{ color: '#9ca3af', fontSize: 13 }}>{result.game_date}</div>}
          </div>

          {/* Summary stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>€{result.total_cost?.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Total Inventory Cost</div>
            </div>
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{result.inserted}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Tickets</div>
            </div>
          </div>

          {/* Category breakdown */}
          {result.category_stats && Object.keys(result.category_stats).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Breakdown by Category:</div>
              {Object.entries(result.category_stats).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f9fafb', borderRadius: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{cat}</span>
                  <span style={{ fontWeight: 600, color: '#1D9E75' }}>{count} tickets</span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              {result.warnings.map((w, i) => <div key={i} style={{ color: '#92400e' }}>⚠️ {w}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reset}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 500 }}>
              Import Another
            </button>
            <button onClick={() => navigate(`/inventory?view=${encodeURIComponent(result.game_name)}`)}
              style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              View Game Inventory →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
