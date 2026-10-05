import { vercelHandler } from '../lib/http.js';
// GET /api/stats - real anonymised LOCAL demo aggregates only. Sample runs and repeated
// identical checks by the same visitor are excluded so numbers are not inflated.
export async function handleStats({ store }) {
  const lines = await store.readLines('metrics');
  const seen = new Set();
  const real = [];
  let samples = 0; let duplicates = 0; let refused = 0;
  for (const m of lines) {
    if (m.refused) { refused++; continue; }
    if (m.sample) { samples++; continue; }
    const k = `${m.visitor}|${m.period}|${m.scenario}|${m.rentPaise}|${m.differencePaise}`;
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k); real.push(m);
  }
  const rentPaise = real.reduce((a, m) => a + (m.rentPaise || 0), 0);
  // "Caught" = absolute differences between expected and actual receipts that our checks surfaced.
  // It is a flagged difference, NOT proven money saved.
  const caughtPaise = real.filter((m) => m.arithmetic === 'SHORT' || m.arithmetic === 'EXCESS').reduce((a, m) => a + Math.abs(m.differencePaise || 0), 0);
  const freq = {};
  for (const m of real) freq[m.treatment] = (freq[m.treatment] || 0) + 1;
  const common = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    status: 200,
    json: {
      label: 'Local demo activity', empty: real.length === 0,
      checks: real.length, monthsClosed: new Set(real.map((m) => `${m.visitor}|${m.period}`)).size,
      rentCheckedPaise: rentPaise, caughtPaise, mostCommonTreatment: common,
      excluded: { samples, duplicates, refused },
      definitions: { caught: 'Sum of differences between expected and actual receipts flagged by checks. Not money saved.' },
    },
  };
}

export default vercelHandler(handleStats, { methods: ['GET'] });
