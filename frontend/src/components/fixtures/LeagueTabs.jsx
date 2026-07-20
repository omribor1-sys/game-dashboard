const FLAG = { PL: '🏴', PD: '🇪🇸', SA: '🇮🇹', CL: '🇪🇺', DED: '🇳🇱', BL1: '🇩🇪', FL1: '🇫🇷' };

export default function LeagueTabs({ competitions, active, onSelect }) {
  return (
    <div className="league-tabs" role="tablist" aria-label="Leagues">
      <button
        role="tab"
        aria-selected={active === 'HOT'}
        className={['league-tab', 'hot-tab', active === 'HOT' ? 'active' : ''].filter(Boolean).join(' ')}
        onClick={() => onSelect('HOT')}
      >
        <span className="label">🔥 Hot Games</span>
      </button>
      {competitions.map(c => (
        <button
          key={c.competition_code}
          role="tab"
          aria-selected={c.competition_code === active}
          className={[
            'league-tab',
            c.competition_code === active ? 'active' : '',
            c.is_default ? 'primary' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSelect(c.competition_code)}
        >
          <span className="flag" aria-hidden="true">{FLAG[c.competition_code] || ''}</span>
          <span className="label">{c.label}</span>
          {c.fixture_count > 0 && (
            <span style={{ fontSize: 10, opacity: 0.65 }}>({c.fixture_count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
