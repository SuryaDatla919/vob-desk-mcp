// Calendar arithmetic on YYYY-MM-DD strings. Pure: no clock, no time zones (all UTC day math).
// ISO dates in this fixed format compare correctly as strings, which the engine relies on.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseDate(iso: string): Ymd {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Not a real calendar date: ${iso}`);
  }
  return { y, m, d };
}

export function isValidDate(iso: string): boolean {
  try {
    parseDate(iso);
    return true;
  } catch {
    return false;
  }
}

function format({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Same calendar day N months later; clamps to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parseDate(iso);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return format({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/** Age in completed years on a date. A birthday on the date itself counts. */
export function ageOn(dob: string, on: string): number {
  const birth = parseDate(dob);
  const day = parseDate(on);
  let age = day.y - birth.y;
  if (day.m < birth.m || (day.m === birth.m && day.d < birth.d)) age -= 1;
  return age;
}

export function yearOf(iso: string): number {
  return parseDate(iso).y;
}
