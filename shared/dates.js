// Dates are ISO strings (YYYY-MM-DD) internally; periods are 'YYYY-MM' calendar months.
// All civil-date arithmetic is done in UTC to avoid DST/timezone drift; user-facing
// deadlines are civil dates in IST (Asia/Kolkata, no DST) so no conversion is needed.

export function parseISO(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new RangeError(`Bad ISO date: ${d}`);
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) throw new RangeError(`Invalid date: ${d}`);
  return dt;
}

export function toISO(dt) {
  return dt.toISOString().slice(0, 10);
}

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
}

export function periodOf(iso) {
  return iso.slice(0, 7);
}

export function periodBounds(period) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new RangeError(`Bad period: ${period}`);
  const [y, m] = period.split('-').map(Number);
  const last = daysInMonth(y, m);
  return { start: `${period}-01`, end: `${period}-${String(last).padStart(2, '0')}`, days: last, year: y, month: m };
}

export function addMonthsToPeriod(period, n) {
  const [y, m] = period.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function comparePeriods(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function periodsBetween(fromPeriod, toPeriod) {
  const out = [];
  for (let p = fromPeriod; p <= toPeriod; p = addMonthsToPeriod(p, 1)) out.push(p);
  return out;
}

// Clamp a day-of-month into the period (billing day 31 in February -> 28/29).
export function clampDay(period, day) {
  const { year, month } = periodBounds(period);
  const d = Math.min(Math.max(1, day), daysInMonth(year, month));
  return `${period}-${String(d).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  const dt = parseISO(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISO(dt);
}

// Adds whole months keeping day-of-month, clamping at month end (31 Jan + 1 month = 28/29 Feb).
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const p = addMonthsToPeriod(`${y}-${String(m).padStart(2, '0')}`, n);
  return clampDay(p, d);
}

export function daysBetweenInclusive(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000) + 1;
}

export function maxISO(a, b) { return a > b ? a : b; }
export function minISO(a, b) { return a < b ? a : b; }

// Indian financial / tax year: April-March. '2026-27'
export function financialYearOf(iso) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function fyBounds(fy) {
  const start = Number(fy.slice(0, 4));
  return { start: `${start}-04-01`, end: `${start + 1}-03-31`, firstPeriod: `${start}-04`, lastPeriod: `${start + 1}-03` };
}

// "Tax year" label under the Income-tax Act, 2025 (from 1 April 2026) vs
// "Assessment year" framing under the 1961 Act. Display only.
export function taxYearLabel(fy) {
  const start = Number(fy.slice(0, 4));
  if (start >= 2026) return { act: 'Income-tax Act, 2025', label: `Tax year ${fy}` };
  return { act: 'Income-tax Act, 1961', label: `FY ${fy} (AY ${start + 1}-${String((start + 2) % 100).padStart(2, '0')})` };
}

export function todayIST(now = new Date()) {
  // IST = UTC+05:30, no DST.
  return toISO(new Date(now.getTime() + 330 * 60000));
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

export function periodLabel(period, lang = 'en') {
  const [y, m] = period.split('-').map(Number);
  return `${(lang === 'hi' ? MONTHS_HI : MONTHS_EN)[m - 1]} ${y}`;
}

export function formatDate(iso, lang = 'en') {
  const [y, m, d] = iso.split('-').map(Number);
  const names = lang === 'hi' ? MONTHS_HI : MONTHS_EN;
  return `${d} ${names[m - 1].slice(0, lang === 'hi' ? undefined : 3)} ${y}`;
}
