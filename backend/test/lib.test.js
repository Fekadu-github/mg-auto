import test from 'node:test';
import assert from 'node:assert/strict';
import { range, totals, e164, revenueReport, hoursReport, dayKey, EAT, DAY } from '../lib.js';

const eat = (d, h = 0, m = 0) => Date.parse(d + 'T00:00:00Z') - EAT + (h * 60 + m) * 60e3;   // a moment in Addis time

test('range: inclusive Addis days, validation', () => {
  const [a, b] = range({ from: '2026-10-07', to: '2026-10-07' });
  assert.equal(b - a, DAY); assert.equal(dayKey(a), '2026-10-07'); assert.equal(dayKey(b - 1), '2026-10-07');
  assert.throws(() => range({ from: '2026-10-08', to: '2026-10-07' }), /before/);
  assert.throws(() => range({ from: 'x' }), /date/);
  assert.throws(() => range({ from: '2026-13-45', to: '2026-13-45' }), /date/);
  assert.throws(() => range({ from: '2024-01-01', to: '2026-01-01' }), /year/);
});

test('totals: VAT and rounding', () => {
  const t = totals({ labours: [{ price: 1000.5 }], parts: [{ qty: 2.5, price: 100.1 }] }, 0.15);
  assert.deepEqual(t, { labour: 1000.5, parts: 250.25, sub: 1250.75, vat: 187.61, total: 1438.36, rate: 0.15 });
});

test('e164: Ethiopian formats', () => {
  for (const p of ['0980766566', '980766566', '+251980766566', '251980766566', '00251 980 766 566', '09 80-76 65 66'])
    assert.equal(e164(p), '+251980766566', p);
  assert.equal(e164('0712345678'), '+251712345678');
  assert.equal(e164('123'), null); assert.equal(e164(''), null); assert.equal(e164('+44 7700 900123'), '+447700900123');
});

test('revenue: invoice day, cash vs credit, proforma ignored, snapshot beats recompute', () => {
  const [a, b] = range({ from: '2026-10-07', to: '2026-10-08' });
  const job = (id, inv, price = 100) => ({ id, cid: 'C-1', vid: 'v1', labours: [{ price }], parts: [], inv });
  const jobs = [
    job('JC-1', { type: 'Cash', no: 'CI-1', date: eat('2026-10-07', 23, 30) }),                       // 23:30 Addis = still the 7th
    job('JC-2', { type: 'Credit', no: 'CR-1', date: eat('2026-10-08', 0, 10), totals: { labour: 500, parts: 0, sub: 500, vat: 50, total: 550, rate: 0.1 } }),
    job('JC-3', { type: 'Proforma', no: 'PF-1', date: eat('2026-10-07', 9) }),
    job('JC-4', { type: 'Cash', no: 'CI-2', date: eat('2026-10-09', 1) }),                              // outside
    job('JC-5', null)];
  const r = revenueReport(jobs, a, b, 0.15, { 'C-1': 'Abebe' }, { v1: 'AA-1' });
  assert.deepEqual(r.days.map(d => [d.day, d.count, d.cash, d.credit]), [['2026-10-07', 1, 115, 0], ['2026-10-08', 1, 0, 550]]);
  assert.equal(r.sum.total, 665); assert.equal(r.invoices[0].customer, 'Abebe'); assert.equal(r.invoices.length, 2);
});

test('hours: clip to range, split at midnight, running clock, completed count, per-tech filter', () => {
  const a = eat('2026-10-07'), b = eat('2026-10-08'), now = eat('2026-10-07', 15);
  const jobs = [{ id: 'JC-1', labours: [
    { id: 'L1', section: 'Mechanical Repairs', logs: [
      { tech: 'Dawit', in: eat('2026-10-06', 22), out: eat('2026-10-07', 2), reason: 'End of work day' },   // 2h on the 6th, 2h on the 7th
      { tech: 'Dawit', in: eat('2026-10-07', 8), out: eat('2026-10-07', 10), reason: 'Completed' }] },       // 2h
    { id: 'L2', section: 'Regular Service', logs: [{ tech: 'Sara', in: eat('2026-10-07', 13), reason: undefined }] }] }];   // running 2h
  const r = hoursReport(jobs, a, b, now);
  assert.deepEqual(r.byTech.map(t => [t.tech, t.hours, t.completed, t.open]), [['Dawit', 4, 1, false], ['Sara', 2, 0, true]]);
  assert.equal(r.total, 6);
  const wide = hoursReport(jobs, eat('2026-10-06'), b, now);
  assert.deepEqual(wide.byDay.filter(d => d.tech === 'Dawit').map(d => [d.day, d.hours]), [['2026-10-06', 2], ['2026-10-07', 4]]);
  assert.deepEqual(hoursReport(jobs, a, b, now, 'Sara').byTech.map(t => t.tech), ['Sara']);
});
