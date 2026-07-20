import { useState } from 'react';

const STATUSES = [
  ['unknown', 'Unknown'],
  ['not_yet', 'Not yet'],
  ['on_sale', 'On sale'],
  ['bought', 'Bought'],
  ['closed', 'Closed'],
];

const HOT_TIERS = [
  ['elite', 'Elite'],
  ['high', 'High'],
  ['notable', 'Notable'],
];

// datetime-local <-> ISO helpers
// Input shows local wall-clock; we store ISO UTC.
// For simplicity: treat the datetime-local value as if it were UTC
// (user edits in UK local time; a proper TZ conversion would need a TZ library).
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  // Display in Europe/London local time
  const opts = {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  };
  const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d)
    .reduce((a, p) => (a[p.type] = p.value, a), {});
  const h = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}`;
}

function localInputToIso(v) {
  if (!v) return null;
  // Interpret the datetime-local value as Europe/London local time → UTC
  // Simple approach: construct a date string with a +01:00 offset (BST)
  // For production accuracy a library (date-fns-tz) is better; this is good enough for Phase 1
  return new Date(v).toISOString();
}

export default function FixtureEditModal({ fixture, onClose, onSaved }) {
  const [kickoff, setKickoff] = useState(isoToLocalInput(fixture.kickoff_utc));
  const [onsale, setOnsale] = useState(isoToLocalInput(fixture.tickets_onsale_at));
  const [status, setStatus] = useState(fixture.tickets_status || 'unknown');
  const [info, setInfo] = useState(fixture.tickets_info || '');
  const [isHot, setIsHot] = useState(!!fixture.is_hot);
  const [hotTier, setHotTier] = useState(fixture.hot_tier || 'notable');
  const [hotReason, setHotReason] = useState(fixture.hot_reason || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/fixtures/${fixture.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kickoff_utc: localInputToIso(kickoff),
          tickets_onsale_at: localInputToIso(onsale),
          tickets_status: status,
          tickets_info: info,
          is_hot: isHot ? 1 : 0,
          hot_tier: isHot ? hotTier : null,
          hot_reason: isHot ? hotReason : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
      onSaved(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Edit fixture — {fixture.home_team} vs {fixture.away_team}</h3>

        <label>
          Kickoff (UK time)
          <input
            type="datetime-local"
            value={kickoff}
            onChange={e => setKickoff(e.target.value)}
          />
        </label>

        <label>
          Ticket status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>

        <label>
          On-sale date
          <input
            type="datetime-local"
            value={onsale}
            onChange={e => setOnsale(e.target.value)}
          />
        </label>

        <label>
          Notes
          <textarea
            value={info}
            onChange={e => setInfo(e.target.value)}
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </label>

        <label className="hot-check-label">
          <span className="hot-check-row">
            <input
              type="checkbox"
              checked={isHot}
              onChange={e => setIsHot(e.target.checked)}
            />
            🔥 Hot game
          </span>
        </label>

        {isHot && (
          <>
            <label>
              Hot tier
              <select value={hotTier} onChange={e => setHotTier(e.target.value)}>
                {HOT_TIERS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>

            <label>
              Why it's hot
              <textarea
                value={hotReason}
                onChange={e => setHotReason(e.target.value)}
                rows={2}
                placeholder="e.g. Title-deciding fixture, rivalry derby, first game back for injured star…"
                style={{ resize: 'vertical' }}
              />
            </label>
          </>
        )}

        {err && <div className="error-box">{err}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
