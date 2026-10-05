import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTasks, toICS } from '../shared/calendar.js';
import { GST_FILING } from '../shared/compliance-config.js';
import { makeZip, crc32 } from '../shared/zip.js';
import { parseBankCSV, toCSV, csvCell } from '../shared/csv.js';
import { financialYearOf, taxYearLabel } from '../shared/dates.js';

const range = { from: '2026-10-01', to: '2027-04-30' };

test('monthly filer: GSTR-1 on 11th and GSTR-3B on 20th of next month', () => {
  const t = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'monthly', stateCode: '19' }, range, { today: '2026-10-05' });
  const sep1 = t.find((x) => x.key === 'GSTR-1|2026-09');
  const sep3 = t.find((x) => x.key === 'GSTR-3B|2026-09');
  assert.equal(sep1.dueDate, '2026-10-11');
  assert.equal(sep3.dueDate, '2026-10-20');
  assert.equal(sep3.responsibility, 'landlord');
  assert.equal(sep3.reviewFlag, true);
  assert.ok(sep3.sourceInfo.url.startsWith('https://tutorial.gst.gov.in'));
});

test('QRMP: state category decides 22nd vs 24th; IFF optional; PMT-06 on 25th; year boundary', () => {
  const wb = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'qrmp', stateCode: '19' }, range);
  assert.equal(wb.find((x) => x.key === 'GSTR-3B|2026-12').dueDate, '2027-01-24');
  const mh = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'qrmp', stateCode: '27' }, range);
  assert.equal(mh.find((x) => x.key === 'GSTR-3B|2026-12').dueDate, '2027-01-22');
  assert.equal(wb.find((x) => x.key === 'GSTR-1|2026-12').dueDate, '2027-01-13');
  const iff = wb.find((x) => x.key === 'IFF|2026-10');
  assert.equal(iff.optional, true); assert.equal(iff.dueDate, '2026-11-13');
  assert.equal(wb.find((x) => x.key === 'PMT-06|2026-11').dueDate, '2026-12-25');
  assert.equal(wb.find((x) => x.key === 'GSTR-3B|2027-03').dueDate, '2027-04-24');
});

test('unregistered landlord gets no GSTR-1/3B duties', () => {
  const t = buildTasks({ gstRegType: 'unregistered', stateCode: '19', agreements: [{ id: 'a', label: 'Flat 4A', dueDay: 5, startDate: '2026-01-15', endDate: '2026-12-14', tenantTdsKind: 'small_individual' }] }, range);
  assert.equal(t.filter((x) => x.form.startsWith('GSTR')).length, 0);
  assert.ok(t.some((x) => x.key === 'RENT|a|2026-10'));
  assert.ok(!t.some((x) => x.key === 'RENT|a|2027-01'));
  assert.equal(t.find((x) => x.key === 'LEASE|a').dueDate, '2026-10-15');
  assert.ok(t.find((x) => x.key === 'TDSCERT|a|2026-12'), 'tenancy-end TDS certificate follow-up');
  const n = buildTasks({ gstRegType: 'unregistered', stateCode: '19', agreements: [{ id: 'b', label: 'X', dueDay: 5, startDate: '2026-01-01', endDate: '2027-03-31', noticeMonths: 2 }] }, range);
  assert.equal(n.find((x) => x.key === 'LEASE|b').dueDate, '2027-01-24');
});

test('extensions apply to the configured form and period only', () => {
  GST_FILING.extensions.push({ form: 'GSTR-3B', period: '2026-10', newDue: '2026-11-25', source: 'test' });
  try {
    const t = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'monthly', stateCode: '19' }, range);
    const oct = t.find((x) => x.key === 'GSTR-3B|2026-10');
    assert.equal(oct.dueDate, '2026-11-25'); assert.equal(oct.extended, true);
    assert.equal(t.find((x) => x.key === 'GSTR-3B|2026-11').dueDate, '2026-12-20');
  } finally { GST_FILING.extensions.length = 0; }
});

test('advance tax only when estimated tax >= Rs 10,000 and not senior without business income', () => {
  const p = { gstRegType: 'unregistered', stateCode: '19' };
  assert.equal(buildTasks({ ...p, advanceTax: { estimatedTaxPaise: 5_000_00 } }, range).filter((x) => x.form === 'Advance tax').length, 0);
  assert.equal(buildTasks({ ...p, advanceTax: { estimatedTaxPaise: 50_000_00, seniorNoBusiness: true } }, range).filter((x) => x.form === 'Advance tax').length, 0);
  const t = buildTasks({ ...p, advanceTax: { estimatedTaxPaise: 50_000_00 } }, range).filter((x) => x.form === 'Advance tax');
  assert.deepEqual(t.map((x) => x.dueDate), ['2026-12-15', '2027-03-15']);
});

test('completion is user-reported and overdue status is computed', () => {
  const t = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'monthly', stateCode: '19' }, range, { today: '2026-10-15', completions: { 'GSTR-1|2026-09': { markedAt: 'x', ackRef: 'AA1' } } });
  assert.equal(t.find((x) => x.key === 'GSTR-1|2026-09').status, 'marked_done');
  assert.equal(t.find((x) => x.key === 'GSTR-3B|2026-09').status, 'upcoming');
  const later = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'monthly', stateCode: '19' }, range, { today: '2026-10-21' });
  assert.equal(later.find((x) => x.key === 'GSTR-3B|2026-09').status, 'overdue');
});

test('ICS is valid RFC 5545: CRLF, folded lines, escaping, two alarms per event', () => {
  const t = buildTasks({ gstRegType: 'regular', gstFilingFrequency: 'monthly', stateCode: '19' }, { from: '2026-10-01', to: '2026-10-31' });
  const ics = toICS(t);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, t.length);
  assert.equal((ics.match(/TRIGGER:-P5D/g) || []).length, t.length);
  assert.equal((ics.match(/TRIGGER:-P1D/g) || []).length, t.length);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(!/\n(?<!\r\n)/.test(ics.replace(/\r\n/g, '')));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261011'));
  assert.ok(/DESCRIPTION:[^\r\n]*\\n/.test(ics));
});

test('zip: valid signature, CRC and entries', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'a.txt', data: 'again' }]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(z.length - 22 + 10, true), 2);
});

test('bank CSV: validation, Indian dates, formula-injection guard', () => {
  const { rows, errors } = parseBankCSV('Date,Narration,Credit,Ref\n08/10/2026,"NEFT NORTHWIND, RENT","1,19,800.00",UTR1\n31/02/2026,bad,10,UTR2\n09/10/2026,x,abc,UTR3\n');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { date: '2026-10-08', amountPaise: 1_19_800_00, reference: 'UTR1', narration: 'NEFT NORTHWIND, RENT' });
  assert.deepEqual(errors.map((e) => e.message), ['BAD_DATE', 'BAD_AMOUNT']);
  assert.equal(parseBankCSV('foo,bar\n1,2').errors[0].message, 'MISSING_COLUMNS');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-500'), '-500');
  assert.equal(toCSV([{ a: 1 }], [{ label: 'A', key: 'a' }]), 'A\r\n1\r\n');
});

test('financial / tax year labels around the new Act', () => {
  assert.equal(financialYearOf('2027-03-31'), '2026-27');
  assert.equal(financialYearOf('2027-04-01'), '2027-28');
  assert.equal(taxYearLabel('2026-27').act, 'Income-tax Act, 2025');
  assert.match(taxYearLabel('2025-26').label, /AY 2026-27/);
});
