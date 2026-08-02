import { seasonLabel, currentSeasonStart } from '../lib/season.js';

// Small season picker. `value` is a start-year number or 'all'.
export default function SeasonSelect({ seasons, value, onChange }) {
  const cur = currentSeasonStart();
  return (
    <select
      value={String(value)}
      onChange={e => { const v = e.target.value; onChange(v === 'all' ? 'all' : Number(v)); }}
      title="Season"
      style={{
        padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 9,
        fontSize: 13.5, fontWeight: 600, color: '#111827', background: '#fff', cursor: 'pointer',
      }}
    >
      {seasons.map(y => (
        <option key={y} value={String(y)}>
          {seasonLabel(y)}{y === cur ? ' (current)' : ''}
        </option>
      ))}
      <option value="all">All seasons</option>
    </select>
  );
}
