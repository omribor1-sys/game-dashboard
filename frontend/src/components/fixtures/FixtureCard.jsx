import { googleCalendarUrl } from './calendarLinks';

const TICKET_LABEL = {
  unknown: 'Unknown',
  not_yet: 'Not yet',
  on_sale: 'On sale',
  bought: 'Bought',
  closed: 'Closed',
};

const TICKET_BADGE = {
  unknown: 'badge-gray',
  not_yet: 'badge-amber',
  on_sale: 'badge-green',
  bought: 'badge-blue',
  closed: 'badge-gray',
};

const HOT_TIER_LABEL = { elite: 'Elite', high: 'High', notable: 'Notable' };
const HOT_TIER_CLASS = { elite: 'hot-elite', high: 'hot-high', notable: 'hot-notable' };

function eur(n, signed = false) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${signed ? (v >= 0 ? '+' : '−') : ''}€${s}`;
}

function Crest({ url, tla }) {
  if (url) {
    return (
      <img
        className="crest"
        src={url}
        alt={tla || ''}
        width="26"
        height="26"
        loading="lazy"
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
  const isDimmed = !isTracked && !fx.is_hot;
  const isPrimaryHome = !!fx.home_primary;

  const matchTitle = `${fx.home_team} vs ${fx.away_team}`;
  const hasScore = Number.isInteger(fx.home_score) && Number.isInteger(fx.away_score);
  // bold the winning side once a result is in
  const teamCls = (tracked, side) => [
    'team', tracked ? 'on' : '',
    hasScore && fx.winner === `${side}_TEAM` ? 'won' : '',
  ].filter(Boolean).join(' ');

  // Split kickoff_local: "Fri, 21/08/2026, 20:00" → date "Fri, 21/08/2026" + time "20:00"
  const kickoffParts = (fx.kickoff_local || '').split(',').map(s => s.trim());
  const kickoffDate = kickoffParts.slice(0, 2).join(', ') || '—';
  const kickoffTime = kickoffParts[2] || '';

  function openCalendar(kind) {
    const isTickets = kind === 'tickets';
    const start = isTickets ? fx.tickets_onsale_at : fx.kickoff_utc;
    if (!start) return;
    const title = isTickets ? `🎟️ Tickets: ${matchTitle}` : matchTitle;
    window.open(
      googleCalendarUrl({ title, startUtc: start, details: fx.tickets_info || '', location: '' }),
      '_blank',
      'noopener'
    );
  }

  const cardClasses = [
    'fixture-card card',
    isDimmed ? 'dim' : 'tracked',
    isPrimaryHome ? 'primary-home' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {/* Main row: date/time | teams (inline) | badges | meta. Horizontal on desktop, wraps on mobile. */}
      <div className="fc-main">
        <div className="fc-when">
          <span className="fc-date">{kickoffDate}</span>
          {kickoffTime && <span className="fc-time">{kickoffTime}</span>}
        </div>

        <div className="fc-teams">
          <span className="fc-side home">
            <Crest url={fx.home_crest} tla={fx.home_tla} />
            <span className={teamCls(homeTracked, 'HOME')}>{fx.home_team || '—'}</span>
          </span>
          {hasScore ? (
            <span className="fc-score" title={fx.status === 'FINISHED' ? 'Full time' : fx.status}>
              {fx.home_score}<span className="fc-score-dash">–</span>{fx.away_score}
            </span>
          ) : (
            <span className="fc-vs">VS</span>
          )}
          <span className="fc-side away">
            <span className={teamCls(awayTracked, 'AWAY')}>{fx.away_team || '—'}</span>
            <Crest url={fx.away_crest} tla={fx.away_tla} />
          </span>
        </div>

        <div className="fc-tags">
          {isTracked ? (
            <span className={`badge ${homeTracked ? 'badge-green' : 'badge-gray'}`}>
              {homeTracked ? '🏠 Home' : '✈️ Away'}
            </span>
          ) : null}
          {fx.last_changed_at ? (
            <span className="fc-changed" title={`Moved from ${fx.previous_kickoff_local || '—'} to ${fx.kickoff_local || '—'}`}>⚠️</span>
          ) : null}
          {fx.is_hot ? (
            <span className={`hot-badge ${HOT_TIER_CLASS[fx.hot_tier] || 'hot-notable'}`} title={fx.hot_reason || ''}>
              🔥 {HOT_TIER_LABEL[fx.hot_tier] || 'Hot'}
            </span>
          ) : null}
        </div>

        <span className="fc-meta">
          {fx.competition_code}
          {fx.matchday ? ` · MW ${fx.matchday}` : ''}
          {fx.stage && fx.stage !== 'REGULAR_SEASON' ? ` · ${fx.stage.replace(/_/g, ' ')}` : ''}
        </span>
      </div>

      {/* Hot reason line */}
      {fx.is_hot && fx.hot_reason ? <div className="fc-hot-reason">🔥 {fx.hot_reason}</div> : null}

      {/* Closed-game P&L (only present once the game has been closed with costs) */}
      {fx.pnl ? (
        <div className={`fc-pnl ${fx.pnl.net_profit >= 0 ? 'pos' : 'neg'}`} title={fx.pnl.game_name}>
          <span className="fc-pnl-main">
            {fx.pnl.net_profit >= 0 ? '📈' : '📉'} {eur(fx.pnl.net_profit, true)}
          </span>
          <span className="fc-pnl-sub">
            Revenue {eur(fx.pnl.revenue)} · Cost {eur(fx.pnl.cost)}
            {fx.pnl.margin_percent != null ? ` · ${fx.pnl.margin_percent}%` : ''}
            {fx.pnl.tickets_sold != null ? ` · ${fx.pnl.tickets_sold} tickets` : ''}
          </span>
        </div>
      ) : null}

      {/* Foot: ticket status + actions */}
      <div className="fc-foot">
        <div className="fc-tickets">
          <span className={`badge ${TICKET_BADGE[fx.tickets_status] || 'badge-gray'}`}>
            🎟️ {TICKET_LABEL[fx.tickets_status] || '—'}
          </span>
          {fx.tickets_onsale_local && <span className="fc-ticket-date">· {fx.tickets_onsale_local}</span>}
          {fx.manually_overridden ? <span className="fc-edited">edited</span> : null}
        </div>

        <div className="fc-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => openCalendar('match')} title="Add match reminder to calendar" disabled={!fx.kickoff_utc}>📅 Match</button>
          {fx.tickets_onsale_at && (
            <button className="btn btn-ghost btn-sm" onClick={() => openCalendar('tickets')} title="Add ticket purchase reminder to calendar">🎟️ Tickets</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(fx)} title="Edit fixture">✎ Edit</button>
        </div>
      </div>
    </div>
  );
}
