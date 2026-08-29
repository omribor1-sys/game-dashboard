import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Competitions Omri actually trades stay on the bar; the rest fold into "More leagues".
// Eleven equal pills gave every competition the same weight — 306 Eredivisie fixtures took
// the same room as 380 Premier League ones. Order here IS the priority order.
const PRIMARY = ['PL', 'CL', 'UEL', 'EFL'];

// Shown instead of the full name below 640px, where the full names cannot all fit.
const ABBR = {
  PL: 'PL', CL: 'UCL', UEL: 'UEL', EFL: 'EFL',
  PD: 'LaLiga', SA: 'Serie A', BL1: 'BL', FL1: 'L1', DED: 'ERE',
};

const Icon = ({ d, circle }) => (
  <svg className="lt-ic" viewBox="0 0 24 24" aria-hidden="true"
       fill="none" stroke="currentColor" strokeWidth="1.75"
       strokeLinecap="round" strokeLinejoin="round">
    {circle && <circle cx="12" cy="12" r="9" />}
    <path d={d} />
  </svg>
);
const GlobeIcon = () => <Icon circle d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />;
const FlameIcon = () => <Icon d="M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5.8-2.8 1.5-3.5C9 9 10 10 10 11c0-2 1-5 2-8Z" />;
const ChevronIcon = () => <Icon d="m6 9 6 6 6-6" />;

export default function LeagueTabs({ competitions, active, onSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef(null);
  const menuRef = useRef(null);
  const [indicator, setIndicator] = useState(null);

  const primary = PRIMARY
    .map(code => competitions.find(c => c.competition_code === code))
    .filter(Boolean);
  let overflow = competitions.filter(c => !PRIMARY.includes(c.competition_code));

  // A league picked from the menu is promoted onto the bar, otherwise the thing you just
  // chose would be the one thing you cannot see.
  const promoted = overflow.find(c => c.competition_code === active);
  if (promoted) overflow = overflow.filter(c => c !== promoted);

  const items = [
    { key: 'ALL', label: 'All comps', abbr: 'All', icon: <GlobeIcon />, count: null },
    { key: 'HOT', label: 'Hot games', abbr: 'Hot', icon: <FlameIcon />, count: null, hot: true },
    ...[...primary, ...(promoted ? [promoted] : [])].map(c => ({
      key: c.competition_code,
      label: c.label,
      abbr: ABBR[c.competition_code] || c.competition_code,
      count: c.fixture_count,
    })),
  ];

  // Slide the active pill instead of repainting it — measured from the live DOM so it
  // stays correct when labels swap to abbreviations at narrow widths.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    if (!el) { setIndicator(null); return; }
    const move = () => setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    move();
    const ro = new ResizeObserver(move);
    ro.observe(el);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [active, items.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  // Roving tabindex: one stop in the page tab order, arrows move between tabs.
  function onKeyDown(e, index) {
    const last = items.length - 1;
    let next = index;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    onSelect(items[next].key);
    listRef.current?.querySelectorAll('.lt-tab')[next]?.focus();
  }

  return (
    <div className="lt-bar">
      <div className="lt-list" role="tablist" aria-label="Competitions" ref={listRef}>
        {indicator && (
          <span className={`lt-indicator${active === 'HOT' ? ' hot' : ''}`}
                style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
                aria-hidden="true" />
        )}
        {items.map((it, i) => {
          const selected = it.key === active;
          return (
            <button
              key={it.key}
              role="tab"
              type="button"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`lt-tab${it.hot ? ' hot' : ''}`}
              onClick={() => onSelect(it.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {it.icon}
              <span className="lt-full">{it.label}</span>
              <span className="lt-abbr">{it.abbr}</span>
              {it.count > 0 && <span className="lt-count">{it.count}</span>}
            </button>
          );
        })}
      </div>

      {overflow.length > 0 && (
        <div className="lt-more" ref={menuRef}>
          <button
            type="button"
            className="lt-tab lt-more-btn"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen(o => !o)}
          >
            <span className="lt-full">More leagues</span>
            <span className="lt-abbr">More</span>
            <ChevronIcon />
          </button>
          {menuOpen && (
            <div className="lt-menu" role="menu">
              {overflow.map(c => (
                <button
                  key={c.competition_code}
                  role="menuitem"
                  type="button"
                  className="lt-menu-item"
                  onClick={() => { onSelect(c.competition_code); setMenuOpen(false); }}
                >
                  <span>{c.label}</span>
                  {c.fixture_count > 0 && <span className="lt-count">{c.fixture_count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
