// CSV build/parse helpers. Values starting with = + - @ are prefixed with ' to stop
// spreadsheet formula injection in exported ledgers.
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, headers) {
  const head = headers.map((h) => csvCell(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => csvCell(typeof h.value === 'function' ? h.value(r) : r[h.key])).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}

export function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Validate a bank-statement CSV: needs date, amount (credit) and optionally reference/narration.
 * Accepts headers like Date, Amount|Credit, Reference|Ref|UTR, Narration|Description.
 * Returns { rows:[{date, amountPaise, reference, narration}], errors:[{line, message}] }
 */
export function parseBankCSV(text, maxRows = 500) {
  const rows = parseCSV(text);
  const errors = [];
  if (rows.length < 2) return { rows: [], errors: [{ line: 1, message: 'NO_ROWS' }] };
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (...names) => h.findIndex((x) => names.includes(x));
  const di = col('date', 'txn date', 'transaction date', 'value date');
  const ai = col('amount', 'credit', 'credit amount', 'deposit', 'cr');
  const ri = col('reference', 'ref', 'utr', 'ref no', 'cheque/ref no');
  const ni = col('narration', 'description', 'particulars', 'remarks');
  if (di < 0 || ai < 0) return { rows: [], errors: [{ line: 1, message: 'MISSING_COLUMNS' }] };
  const out = [];
  for (let i = 1; i < rows.length && out.length < maxRows; i++) {
    const r = rows[i];
    const rawDate = (r[di] || '').trim();
    const date = normaliseDate(rawDate);
    const amtStr = (r[ai] || '').replace(/[,\s₹]|Rs\.?/g, '');
    if (!date) { errors.push({ line: i + 1, message: 'BAD_DATE' }); continue; }
    if (!/^\d+(\.\d{1,2})?$/.test(amtStr)) { if (amtStr) errors.push({ line: i + 1, message: 'BAD_AMOUNT' }); continue; }
    const [w, f = ''] = amtStr.split('.');
    const amountPaise = Number(w) * 100 + Number((f + '00').slice(0, 2));
    if (amountPaise <= 0) continue;
    out.push({ date, amountPaise, reference: ri >= 0 ? (r[ri] || '').trim().slice(0, 64) : '', narration: ni >= 0 ? (r[ni] || '').trim().slice(0, 140) : '' });
  }
  return { rows: out, errors };
}

function normaliseDate(s) {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // DD/MM/YYYY (Indian banks)
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}
function valid(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
