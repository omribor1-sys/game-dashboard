import { googleCalendarUrl } from './calendarLinks';

const TICKET_LABEL = {
  unknown: 'לא ידוע',
  not_yet: 'טרם',
  on_sale: 'במכירה',
  bought: 'נקנה',
  closed: 'נסגר',
};

const TICKET_BADGE = {
  unknown: 'badge-gray',
  not_yet: 'badge-amber',
  on_sale: 'badge-green',
  bought: 'badge-blue',
  closed: 'badge-gray',
};

function Crest({ url, tla }) {
  if (url) {
    return (
      <img
        className="crest"
        src={url}
        alt={tla || ''}
        width="26"
        height="26"
        onError={e => { e.target.style.display = 'none'; }}
      />
    );
  }
  return <span className="crest crest-fallback">{tla || '?'}</span>;
}

export default function FixtureCard({ fx, trackedTeamIds, onEdit }) {
  const homeTracked = trackedTeamIds.has(fx.home_team_id);
  const awayTracked = trackedTeamIds.has(fx.away_team_id);
  const isTracked = homeTracked || awayTracked;
  const isPrimaryHome = !!fx.home_primary;

  const matchTitle = `${fx.home_team} vs ${fx.away_team}`;

  // Split kickoff_local: "Fri, 21/08/2026, 20:00"
  const kickoffParts = (fx.kickoff_local || '').split(',').map(s => s.trim());
  const kickoffDate = kickoffParts.slice(0, 2).join(', ') || '—';
  const kickoffTime = kickoffParts[2] || '';

  function openCalendar(kind) {
    const isTickets = kind === 'tickets';
    const start = isTickets ? fx.tickets_onsale_at : fx.kickoff_utc;
    if (!start) return;
    const title = isTickets ? `🎟️ כרטיסים: ${matchTitle}` : matchTitle;
    window.open(
      googleCalendarUrl({ title, startUtc: start, details: fx.tickets_info || '', location: '' }),
      '_blank',
      'noopener'
    );
  }

  const cardClasses = [
    'fixture-card card',
    isTracked ? 'tracked' : 'dim',
    isPrimaryHome ? 'primary-home' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {/* Main row: when + teams + meta */}
      <div className="fc-row-main">
        {/* Date / time */}
        <div className="fc-when">
          <div className="fc-date">{kickoffDate}</div>
          {kickoffTime && <div className="fc-time">{kickoffTime}</div>}
        </div>

        {/* Teams */}
        <div className="fc-teams" style={{ flex: 1 }}>
          <span className="fc-side">
            <Crest url={fx.home_crest} tla={fx.home_tla} />
            <span className={homeTracked ? 'team on' : 'team'}>{fx.home_team || '—'}</span>
          </span>
          <span className="fc-vs">VS</span>
          <span className="fc-side">
            <span className={awayTracked ? 'team on' : 'team'}>{fx.away_team || '—'}</span>
            <Crest url={fx.away_crest} tla={fx.away_tla} />
          </span>

          {/* Home/away badge for tracked teams */}
          {isTracked && (
            <span className={`badge ${homeTracked ? 'badge-green' : 'badge-gray'}`}>
              {homeTracked ? '🔴 בית' : '⚪ חוץ'}
            </span>
          )}

          {/* Reschedule warning */}
          {fx.last_changed_at && (
            <span
              className="fc-changed"
              title={`זז מ‑${fx.previous_kickoff_local || '—'} ל‑${fx.kickoff_local || '—'}`}
            >
              ⚠️
            </span>
          )}
        </div>

        {/* Competition + matchday */}
        <div className="fc-meta">
          {fx.competition_code}
          {fx.matchday ? ` · מחזור ${fx.matchday}` : ''}
          {fx.stage ? ` · ${fx.stage}` : ''}
        </div>
      </div>

      {/* Bottom row: ticket strip + actions */}
      <div className="fc-row-bottom">
        <div className="fc-tickets">
          <span className={`badge ${TICKET_BADGE[fx.tickets_status] || 'badge-gray'}`}>
            🎟️ {TICKET_LABEL[fx.tickets_status] || '—'}
          </span>
          {fx.tickets_onsale_local && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {fx.tickets_onsale_local}</span>
          )}
          {fx.manually_overridden ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>נערך ידנית</span>
          ) : null}
        </div>

        <div className="fc-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => openCalendar('match')}
            title="הוסף תזכורת משחק ליומן"
            disabled={!fx.kickoff_utc}
          >
            📅 משחק
          </button>
          {fx.tickets_onsale_at && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => openCalendar('tickets')}
              title="הוסף תזכורת רכש כרטיסים ליומן"
            >
              🎟️ תזכורת
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onEdit(fx)}
            title="ערוך משחק"
          >
            ✎ ערוך
          </button>
        </div>
      </div>
    </div>
  );
}
