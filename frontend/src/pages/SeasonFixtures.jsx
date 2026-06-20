import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import './../styles/fixtures.css';
import LeagueTabs from '../components/fixtures/LeagueTabs';
import FixtureFilters from '../components/fixtures/FixtureFilters';
import FixtureCard from '../components/fixtures/FixtureCard';
import FixtureEditModal from '../components/fixtures/FixtureEditModal';

export default function SeasonFixtures() {
  const [params, setParams] = useSearchParams();
  const competition = params.get('competition') || 'PL';
  const [competitions, setCompetitions] = useState([]);
  const [meta, setMeta] = useState({ teams: [], months: [], matchdays: [], last_synced_at: null });
  const [fixtures, setFixtures] = useState([]);
  const [view, setView] = useState('calendar');   // 'calendar' | 'matchweek'
  const [filters, setFilters] = useState({ team: '', month: '', homeAway: 'all', tracked: false });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const loadMeta = useCallback(() => {
    Promise.all([
      fetch('/api/fixtures/competitions', { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/fixtures/meta?competition=${competition}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([comps, m]) => {
      setCompetitions(Array.isArray(comps) ? comps : []);
      setMeta(m && m.teams ? m : { teams: [], months: [], matchdays: [], last_synced_at: null });
    }).catch(e => setError(e.message));
  }, [competition]);

  const loadFixtures = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ competition });
    if (filters.team) q.set('team', filters.team);
    if (filters.month) q.set('month', filters.month);
    if (filters.team && filters.homeAway !== 'all') q.set('homeAway', filters.homeAway);
    if (filters.tracked) q.set('tracked', '1');
    fetch(`/api/fixtures?${q.toString()}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setFixtures(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [competition, filters]);

  useEffect(loadMeta, [loadMeta]);
  useEffect(loadFixtures, [loadFixtures]);

  function setCompetition(code) {
    setParams(p => { p.set('competition', code); return p; });
    setFilters({ team: '', month: '', homeAway: 'all', tracked: false });
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      await fetch('/api/fixtures/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competition_code: competition }),
      });
      loadMeta();
      loadFixtures();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  const activeComp = competitions.find(c => c.competition_code === competition);

  // ── Derived grouping ────────────────────────────────────────────────────────
  const trackedTeamIds = new Set(meta.teams.filter(t => t.is_tracked).map(t => t.api_team_id));
  const primaryTeamId = (meta.teams.find(t => t.is_primary) || {}).api_team_id;

  function groupByDate(list) {
    const m = new Map();
    for (const f of list) {
      const k = (f.kickoff_local || '—').split(',').slice(1, 2).join('').trim() || '—';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return [...m.entries()];
  }

  function groupByMatchday(list) {
    const m = new Map();
    for (const f of list) {
      const k = f.matchday != null ? f.matchday : '—';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return [...m.entries()].sort((a, b) => (a[0] === '—' ? 1 : b[0] === '—' ? -1 : a[0] - b[0]));
  }

  const groups = view === 'calendar' ? groupByDate(fixtures) : groupByMatchday(fixtures);

  const clearFilters = () => setFilters({ team: '', month: '', homeAway: 'all', tracked: false });

  return (
    <div className="page fixtures-page" dir="ltr">
      <div className="page-header">
        <div>
          <h1 className="page-title">Season Fixtures</h1>
          <p className="page-subtitle">{activeComp ? activeComp.name : 'Premier League 2026/27'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" disabled={syncing} onClick={syncNow}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {meta.last_synced_at && (
            <span className="muted">Updated: {meta.last_synced_at.slice(0, 16).replace('T', ' ')}</span>
          )}
        </div>
      </div>

      <LeagueTabs competitions={competitions} active={competition} onSelect={setCompetition} />
      <FixtureFilters meta={meta} filters={filters} onChange={setFilters} view={view} onView={setView} />

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : fixtures.length === 0 ? (
        <div className="fx-empty">
          <div className="fx-empty-icon">📅</div>
          <p>No fixtures match the filters</p>
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className={`fixtures-${view}`}>
          {groups.map(([key, items]) => (
            <section key={key} className="fx-group">
              <h3 className="fx-group-title">
                {view === 'matchweek' ? `Matchweek ${key}` : key}
              </h3>
              {items.map(f => (
                <FixtureCard
                  key={f.id}
                  fx={{ ...f, home_primary: f.home_team_id === primaryTeamId }}
                  trackedTeamIds={trackedTeamIds}
                  onEdit={setEditing}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {editing && (
        <FixtureEditModal
          fixture={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadFixtures(); }}
        />
      )}
    </div>
  );
}
