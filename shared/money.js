// Money is always integer paise. Never use floating rupees for arithmetic.
// Rounding policy: round half away from zero at the paise level, applied once per
// computed component (each tax component, each escalation step, each proration).

export const RECONCILIATION_TOLERANCE_PAISE = 100; // Rs. 1

export function rupeesToPaise(r) {
  if (r === null || r === undefined || r === '') return 0;
  const s = String(r).replace(/[,\s]/g, '').replace(/^Rs\.?/i, '');
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) throw new RangeError(`Not a rupee amount: ${r}`);
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const p = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -p : p;
}

export function roundHalfUp(n) {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

// amount * numerator / denominator with half-up rounding, safe for paise integers.
export function mulDiv(amountPaise, numerator, denominator) {
  if (!Number.isInteger(amountPaise)) throw new TypeError('amount must be integer paise');
  return roundHalfUp((amountPaise * numerator) / denominator);
}

// Percentage given in basis points (18% = 1800) to avoid float rates.
export function pctOf(amountPaise, basisPoints) {
  return mulDiv(amountPaise, basisPoints, 10000);
}

export function sum(list) {
  return list.reduce((a, b) => a + b, 0);
}

// Indian digit grouping: 12,34,56,789.00
export function formatINR(paise, { symbol = 'Rs. ', decimals = true } = {}) {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const s = String(whole);
  let grouped;
  if (s.length <= 3) grouped = s;
  else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  return `${neg ? '-' : ''}${symbol}${grouped}${decimals ? '.' + frac : ''}`;
}

export function withinTolerance(a, b, tol = RECONCILIATION_TOLERANCE_PAISE) {
  return Math.abs(a - b) <= tol;
}
