// Contract-amount arithmetic. Amounts are always DERIVED from the agreement's base amount,
// base date and escalation schedule for a given date - never by incrementing a stored
// "current rent". Re-running a month therefore always gives the same answer.
import { mulDiv, pctOf } from './money.js';
import { addMonths } from './dates.js';

/** Escalation anniversaries (ISO dates) on or before `date`. */
export function anniversariesUpTo(escalation, date) {
  if (!escalation || !escalation.firstDate || !['percent', 'fixed'].includes(escalation.type)) return [];
  const every = escalation.everyMonths || 12;
  const out = [];
  for (let k = 0; k < 600; k++) {
    // Always step from firstDate so 29 Feb anniversaries clamp per year (28 Feb) and recover.
    const d = addMonths(escalation.firstDate, k * every);
    if (d > date) break;
    out.push(d);
  }
  return out;
}

/** Escalation change dates strictly inside (from, to]. Used to split a service period. */
export function changeDatesWithin(charge, from, to) {
  const esc = charge?.escalation;
  if (!esc) return [];
  if (esc.type === 'steps') return (esc.steps || []).map((s) => s.from).filter((d) => d > from && d <= to);
  return anniversariesUpTo(esc, to).filter((d) => d > from);
}

/**
 * Monthly contract amount (paise) in force on `date` for a fixed charge.
 * charge: { basis, amountPaise, escalation:{ type:'none'|'percent'|'fixed'|'steps', bp, incrementPaise,
 *           everyMonths, firstDate, compounding, steps:[{from, amountPaise}] } }
 */
export function amountOn(charge, date) {
  if (!charge || charge.basis === 'none') return { amountPaise: 0, steps: 0, explanation: [] };
  const base = charge.amountPaise || 0;
  const esc = charge.escalation || { type: 'none' };
  if (esc.type === 'steps') {
    const steps = [...(esc.steps || [])].sort((a, b) => (a.from < b.from ? -1 : 1));
    const applicable = steps.filter((s) => s.from <= date).pop();
    return applicable
      ? { amountPaise: applicable.amountPaise, steps: 1, explanation: [{ code: 'STEP', from: applicable.from, amountPaise: applicable.amountPaise }] }
      : { amountPaise: base, steps: 0, explanation: [] };
  }
  const anns = anniversariesUpTo(esc, date);
  if (!anns.length || esc.type === 'none') return { amountPaise: base, steps: 0, explanation: [] };
  let amt = base;
  const explanation = [];
  if (esc.type === 'percent') {
    for (const d of anns) {
      // Each step rounds to the nearest paise (documented rounding policy).
      amt = esc.compounding === false ? base + pctOf(base, esc.bp) * (explanation.length + 1) : mulDiv(amt, 10000 + esc.bp, 10000);
      explanation.push({ code: 'PERCENT', date: d, bp: esc.bp, amountPaise: amt });
    }
  } else if (esc.type === 'fixed') {
    for (const d of anns) {
      amt += esc.incrementPaise || 0;
      explanation.push({ code: 'FIXED', date: d, incrementPaise: esc.incrementPaise, amountPaise: amt });
    }
  }
  return { amountPaise: amt, steps: anns.length, explanation };
}

/** Next escalation date after `date` (for "Rent increases next month" notices). */
export function nextChangeAfter(charge, date) {
  const esc = charge?.escalation;
  if (!esc || esc.type === 'none' || charge.basis === 'none') return null;
  if (esc.type === 'steps') {
    const s = (esc.steps || []).map((x) => x.from).filter((d) => d > date).sort()[0];
    return s ? { date: s, amountPaise: esc.steps.find((x) => x.from === s).amountPaise } : null;
  }
  if (!esc.firstDate) return null;
  const every = esc.everyMonths || 12;
  for (let k = 0; k < 600; k++) {
    const d = addMonths(esc.firstDate, k * every);
    if (d > date) return { date: d, amountPaise: amountOn(charge, d).amountPaise };
  }
  return null;
}
