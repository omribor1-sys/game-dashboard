import { useState, useEffect } from 'react';

// Form comes back as "W,D,L,W,W" (most recent last).
function Form({ value }) {
  if (!value) return null;
  return (
    <span className="st-form">
      {value.split(',').map((r, i) => (
        <span key={i} className={`st-form-dot st-${r.trim().toLowerCase()}`} title={r.trim()}>{r.trim()}</span>
      ))}
    </span>
  );
}

export default function StandingsTable({ competition }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/fixtures/standings?competition=${competition}`, { credentials: 'include' })
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [competition]);

  if (loading) return <div className="loading">Loading table…</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data || !data.groups || data.groups.length === 0) {
    return (
      <div className="fx-empty">
        <div className="fx-empty-icon">🏆</div>
        <p>No table for this competition yet — run “Sync now”.</p>
      </div>
    );
  }

  return (
    <div className="standings">
      {data.updated_at && (
        <p className="muted st-updated">Table updated: {String(data.updated_at).slice(0, 16).replace('T', ' ')}</p>
      )}
      {data.groups.map(g => (
        <section key={g.group || 'main'} className="st-block">
          {g.group && <h3 className="fx-group-title">{g.group.replace(/_/g, ' ')}</h3>}
          <div className="st-scroll">
            <table className="st-table">
              <thead>
                <tr>
                  <th className="st-pos">#</th>
                  <th className="st-team">Team</th>
                  <th>P</th><th>W</th><th>D</th><th>L</th>
                  <th className="st-hide-sm">GF</th>
                  <th className="st-hide-sm">GA</th>
                  <th>GD</th>
                  <th className="st-pts">Pts</th>
                  <th className="st-hide-sm">Form</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map(r => (
                  <tr key={r.position} className={r.is_tracked ? 'st-tracked' : ''}>
                    <td className="st-pos">{r.position}</td>
                    <td className="st-team">
                      {r.crest_url && <img src={r.crest_url} alt="" width="20" height="20" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{r.team_name}</span>
                    </td>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.draw}</td><td>{r.lost}</td>
                    <td className="st-hide-sm">{r.goals_for}</td>
                    <td className="st-hide-sm">{r.goals_against}</td>
                    <td>{r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}</td>
                    <td className="st-pts">{r.points}</td>
                    <td className="st-hide-sm"><Form value={r.form} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
