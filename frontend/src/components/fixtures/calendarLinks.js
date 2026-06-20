// Pure helpers — no React. Build a Google Calendar "add event" URL and an .ics blob URL.

function fmtUtc(iso) {
  // 2026-08-21T19:00:00Z -> 20260821T190000Z
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl({ title, startUtc, endUtc, details = '', location = '' }) {
  const end = endUtc || new Date(new Date(startUtc).getTime() + 2 * 3600 * 1000).toISOString();
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmtUtc(startUtc)}/${fmtUtc(end)}`,
    details, location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function icsBlobUrl({ title, startUtc, endUtc, details = '', location = '' }) {
  const end = endUtc || new Date(new Date(startUtc).getTime() + 2 * 3600 * 1000).toISOString();
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `DTSTART:${fmtUtc(startUtc)}`, `DTEND:${fmtUtc(end)}`,
    `SUMMARY:${title}`, `DESCRIPTION:${details}`, `LOCATION:${location}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
}
