export default function FixtureFilters({ meta, filters, onChange, view, onView }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const teamSelected = !!filters.team;
  const hasActiveFilter = filters.team || filters.month || filters.tracked || filters.homeAway !== 'all';

  return (
    <div className="fixture-filters">
      {/* Team dropdown */}
      <select
        value={filters.team}
        onChange={e => set({ team: e.target.value, homeAway: 'all' })}
        aria-label="Select a team"
      >
        <option value="">All teams</option>
        {meta.teams.map(t => (
          <option key={t.api_team_id} value={t.api_team_id}>
            {(t.is_tracked ? '★ ' : '') + t.name + (t.cnt ? ` (${t.cnt})` : '')}
          </option>
        ))}
      </select>

      {/* Month dropdown */}
      <select
        value={filters.month}
        onChange={e => set({ month: e.target.value })}
        aria-label="Select month"
      >
        <option value="">All season</option>
        {(meta.months || []).map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {/* Home / Away segmented control */}
      <div
        className={`seg${teamSelected ? '' : ' disabled'}`}
        title={teamSelected ? '' : 'Select a team first'}
        role="group"
        aria-label="Home / Away"
      >
        {[
          { v: 'all', label: 'All' },
          { v: 'home', label: 'Home' },
          { v: 'away', label: 'Away' },
        ].map(({ v, label }) => (
          <button
            key={v}
            disabled={!teamSelected}
            className={filters.homeAway === v ? 'on' : ''}
            onClick={() => set({ homeAway: v })}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tracked toggle */}
      <label className="track-toggle">
        <input
          type="checkbox"
          checked={filters.tracked}
          onChange={e => set({ tracked: e.target.checked })}
        />
        My teams only
      </label>

      {/* View switch */}
      <div className="seg view-switch" role="group" aria-label="View">
        <button
          className={view === 'calendar' ? 'on' : ''}
          onClick={() => onView('calendar')}
        >
          Monthly
        </button>
        <button
          className={view === 'matchweek' ? 'on' : ''}
          onClick={() => onView('matchweek')}
        >
          Matchweek
        </button>
      </div>

      {/* Clear */}
      {hasActiveFilter && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onChange({ team: '', month: '', homeAway: 'all', tracked: false })}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
