// Static "Key Dates & Breaks" panel shown at the top of the Hot Games tab.
// Breaks = windows with NO Premier League round (international breaks, FA Cup) — no sales,
// prepare inventory for the round after. Source: docs/research/2026-27-pl-demand-calendar.md.

const BREAKS = [
  { window: '21 Sep – 9 Oct 2026', reason: 'October international break', note: '~2–3 weeks, two empty weekends — long early-season dry spell' },
  { window: '9 – 20 Nov 2026', reason: 'November international break', note: 'empty weekend ~14–15 Nov' },
  { window: '7 – 15 Jan 2027', reason: 'FA Cup Third Round', note: 'empty PL weekend ~9–10 Jan' },
  { window: '11 – 19 Feb 2027', reason: 'FA Cup Fifth Round', note: 'empty weekend ~13–14 Feb (overlaps Feb half-term)' },
  { window: '21 Mar – 9 Apr 2027', reason: 'March international break + FA Cup QF', note: 'longest gap (~3 wks). Easter 26–29 Mar falls inside — NO PL Easter round' },
];

const ANCHORS = [
  { label: 'Season opener', date: 'Fri 21 Aug 2026' },
  { label: 'Boxing Day', date: 'Sat 26 Dec 2026' },
  { label: 'Festive block', date: '26 Dec → 2 Jan' },
  { label: 'Final day (all 10 together)', date: 'Sun 30 May 2027' },
];

export default function KeyDatesPanel() {
  return (
    <div className="key-dates">
      <div className="kd-col">
        <h4 className="kd-title">⏸️ Breaks — no PL round (prepare ahead)</h4>
        <ul className="kd-list">
          {BREAKS.map((b, i) => (
            <li key={i} className="kd-break">
              <span className="kd-window">{b.window}</span>
              <span className="kd-reason">{b.reason}</span>
              <span className="kd-note">{b.note}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="kd-col kd-anchors">
        <h4 className="kd-title">📌 Key anchor dates</h4>
        <ul className="kd-list">
          {ANCHORS.map((a, i) => (
            <li key={i} className="kd-anchor">
              <span className="kd-window">{a.date}</span>
              <span className="kd-reason">{a.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
