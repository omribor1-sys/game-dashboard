import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import './../styles/fixtures.css';
import LeagueTabs from '../components/fixtures/LeagueTabs';
import FixtureFilters from '../components/fixtures/FixtureFilters';
import FixtureCard from '../components/fixtures/FixtureCard';
import FixtureEditModal from '../components/fixtures/FixtureEditModal';
import KeyDatesPanel from '../components/fixtures/KeyDatesPanel';
import StandingsTable from '../components/fixtures/StandingsTable';

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
  const [mode, setMode] = useState('upcoming');   // 'upcoming' | 'past' | 'table'

  const isHot = competition === 'HOT';
  const isAll = competition === 'ALL';   // every competition; team filter spans league + cups

  const loadMeta = useCallback(() => {
    const calls = [fetch('/api/fixtures/competitions', { credentials: 'include' }).then(r => r.json())];
    if (!isHot) {
      calls.push(fetch(`/api/fixtures/meta?competition=${competition}`, { credentials: 'include' }).then(r => r.json()));
    }
    Promise.all(calls).then(([comps, m]) => {
      setCompetitions(Array.isArray(comps) ? comps : []);
      setMeta(m && m.teams ? m : { teams: [], months: [], matchdays: [], last_synced_at: null });
    }).catch(e => setError(e.message));
  }, [competition, isHot]);

  const loadFixtures = useCallback(() => {
    setLoading(true);
    if (isHot) {
      fetch('/api/fixtures/hot', { credentials: 'include' })
        .then(r => r.json())
        .then(data => setFixtures(Array.isArray(data) ? data : []))
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
      return;
    }
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
  }, [competition, filters, isHot]);

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

  // ── Past vs upcoming ────────────────────────────────────────────────────────
  const now = Date.now();
  const isPast = f => f.kickoff_utc && Date.parse(f.kickoff_utc) < now;
  const pastFixtures = fixtures.filter(isPast);
  const upcomingFixtures = fixtures.filter(f => !isPast(f));
  const showPast = mode === 'past';
  const showTable = mode === 'table';
  const visible = showPast ? [...pastFixtures].reverse() : upcomingFixtures;   // past: newest first
  const pastProfit = pastFixtures.reduce((s, f) => s + (f.pnl ? f.pnl.net_profit || 0 : 0), 0);

  const groups = isHot || view === 'calendar' ? groupByDate(visible) : groupByMatchday(visible);

  const clearFilters = () => setFilters({ team: '', month: '', homeAway: 'all', tracked: false });

  return (
    <div className="page fixtures-page" dir="ltr">
      <div className="page-header">
        <div>
          <h1 className="page-title">Season Fixtures</h1>
          <p className="page-subtitle">
            {isHot ? '🔥 Curated hot games across all competitions' : (activeComp ? activeComp.name : 'Premier League 2026/27')}
          </p>
        </div>
        <div className="header-actions">
          <button
            className={`btn ${showPast ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode(m => (m === 'past' ? 'upcoming' : 'past'))}
            title={showPast ? 'Back to upcoming fixtures' : 'Show games that already happened, with result and P&L'}
          >
            {showPast ? '← Upcoming' : `⏮ Past games (${pastFixtures.length})`}
          </button>
          {!isHot && !isAll && (
            <button
              className={`btn ${showTable ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode(m => (m === 'table' ? 'upcoming' : 'table'))}
              title="Current league table"
            >
              {showTable ? '← Fixtures' : '🏆 League table'}
            </button>
          )}
          {!isHot && (
            <>
              <button className="btn btn-primary" disabled={syncing} onClick={syncNow}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              {meta.last_synced_at && (
                <span className="muted">Updated: {meta.last_synced_at.slice(0, 16).replace('T', ' ')}</span>
              )}
            </>
          )}
        </div>
      </div>

      {showPast && pastFixtures.some(f => f.pnl) && (
        <div className={`fx-past-total ${pastProfit >= 0 ? 'pos' : 'neg'}`}>
          Closed games P&amp;L: {pastProfit >= 0 ? '+' : '−'}€{Math.abs(pastProfit).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span className="muted"> · {pastFixtures.filter(f => f.pnl).length} of {pastFixtures.length} games have cost data</span>
        </div>
      )}

      <LeagueTabs competitions={competitions} active={competition} onSelect={setCompetition} />
      {isAll && !showTable && (
        <p className="page-subtitle fx-all-hint">
          Every competition together. Pick a team to see its whole season — league, Europe and cups in one list.
        </p>
      )}
      {isHot && !showTable && <KeyDatesPanel />}
      {!isHot && !showTable && (
        <FixtureFilters meta={meta} filters={filters} onChange={setFilters} view={view} onView={setView} />
      )}

      {error && <div className="error-box">{error}</div>}

      {showTable ? (
        <StandingsTable competition={competition} />
      ) : loading ? (
        <div className="loading">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="fx-empty">
          <div className="fx-empty-icon">{showPast ? '⏮' : isHot ? '🔥' : '📅'}</div>
          <p>{showPast ? 'No past games here yet' : isHot ? 'No hot games marked yet' : 'No fixtures match the filters'}</p>
          {!isHot && !showPast && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      ) : (
        <div className={`fixtures-${isHot ? 'calendar' : view}`}>
          {groups.map(([key, items]) => (
            <section key={key} className="fx-group">
              <h3 className="fx-group-title">
                {!isHot && view === 'matchweek' ? `Matchweek ${key}` : key}
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
