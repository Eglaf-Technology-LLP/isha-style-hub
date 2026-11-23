// One date style everywhere (Developer Corrections Part 7, 7.5), always in
// India time: 19-10-2026, and 19-10-2026, 5:33 PM IST with a time. Same as
// src/lib/dates.ts (the site) - keep the two in step.

type DateInput = Date | string | number | null | undefined;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function istParts(d: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}

// "19-10-2026". A plain "2026-10-19" (a calendar date, no time) is shown as
// that day, never shifted by time zones.
export function formatDate(value: DateInput): string {
  if (typeof value === "string") {
    const m = value.match(DATE_ONLY_RE);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const d = toDate(value);
  if (!d) return "";
  const p = istParts(d);
  return `${p.day}-${p.month}-${p.year}`;
}

// "5:33 PM IST"
export function formatTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const p = istParts(d);
  return `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()} IST`;
}

// "19-10-2026, 5:33 PM IST"
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? `${formatDate(d)}, ${formatTime(d)}` : "";
}

// "Mon, 27-10-2026" - for delivery dates, where the weekday helps.
export function formatDateWithDay(value: DateInput): string {
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    const weekday = new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
    return `${weekday}, ${formatDate(value)}`;
  }
  const d = toDate(value);
  return d ? `${istParts(d).weekday}, ${formatDate(d)}` : "";
}

// For customers: dates in words - "6 Jan 2027", never "06-01-2027", which
// reads as 6 Jan or 1 Jun (client corrections Part 2). Staff emails keep the
// numbers. Same as src/lib/dates.ts.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function istDay(value: DateInput): { y: number; m: number; d: number } | null {
  if (typeof value === "string") {
    const m = value.match(DATE_ONLY_RE);
    if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  const date = toDate(value);
  if (!date) return null;
  const p = istParts(date);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

// "6 Jan 2027"
export function formatDateInWords(value: DateInput): string {
  const p = istDay(value);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : "";
}

// "Wed, 6 Jan 2027"
export function formatDateInWordsWithDay(value: DateInput): string {
  const p = istDay(value);
  if (!p) return "";
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).getUTCDay()];
  return `${weekday}, ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

// "17 Nov 2026, 10:13 PM IST"
export function formatDateTimeInWords(value: DateInput): string {
  const d = toDate(value);
  return d ? `${formatDateInWords(d)}, ${formatTime(d)}` : "";
}
