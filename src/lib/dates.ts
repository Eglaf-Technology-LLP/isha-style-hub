// Dates as the website shows them (src/lib/dates.ts there): in words and in
// India time - "6 Jan 2027", never "06-01-2027", which reads as 4 Jan or
// 1 Apr (client corrections Part 2, A5.1 / A8.3 / A9.3).
//
// Worked out by hand, not with Intl: Hermes' Intl and time-zone support
// varies by device. India has no daylight saving, so India time is always
// UTC + 5:30.

type DateInput = Date | string | number | null | undefined;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The moment as India's wall clock, read with the getUTC* methods.
const istClock = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS);

// The calendar day in India time; a plain "2027-01-06" is that day as-is.
function istDay(value: DateInput): { y: number; m: number; d: number } | null {
  if (typeof value === 'string') {
    const m = value.match(DATE_ONLY_RE);
    if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  const date = toDate(value);
  if (!date) return null;
  const c = istClock(date);
  return { y: c.getUTCFullYear(), m: c.getUTCMonth() + 1, d: c.getUTCDate() };
}

// "6 Jan 2027"
export function formatDateInWords(value: DateInput): string {
  const p = istDay(value);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : '';
}

// "Wed, 6 Jan 2027" - for delivery dates, where the weekday helps.
export function formatDateInWordsWithDay(value: DateInput): string {
  const p = istDay(value);
  if (!p) return '';
  const weekday =
    WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).getUTCDay()];
  return `${weekday}, ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

// "5:33 PM IST"
export function formatTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const c = istClock(d);
  const h24 = c.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(c.getUTCMinutes()).padStart(2, '0');
  return `${h12}:${min} ${h24 < 12 ? 'AM' : 'PM'} IST`;
}

// "17 Nov 2026, 10:13 PM IST"
export function formatDateTimeInWords(value: DateInput): string {
  const d = toDate(value);
  return d ? `${formatDateInWords(d)}, ${formatTime(d)}` : '';
}

// Today in India as "2026-11-24".
export function todayIst(): string {
  const c = istClock(new Date());
  return `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}-${String(c.getUTCDate()).padStart(2, '0')}`;
}

// Calendar days from today (India) to a "2027-01-04" date.
export function daysUntil(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const [ty, tm, td] = todayIst().split('-').map(Number);
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000,
  );
}
