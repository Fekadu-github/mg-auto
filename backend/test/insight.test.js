import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unpaidByAge, salesByDay } from '../insight.js';

const D = 864e5, now = Date.UTC(2026, 9, 23, 9, 0);   // 23 Oct 2026, noon in Addis Ababa

test('unpaid credit invoices are grouped by age and paid or cash ones are left out', () => {
  const r = unpaidByAge([
    { type: 'Credit', balance: 100, date: now - 5 * D }, { type: 'Credit', balance: 50, date: now - 45 * D }, { type: 'Credit', balance: 70, date: now - 200 * D },
    { type: 'Cash', balance: 0, date: now }, { type: 'Credit', balance: 0, date: now }], now);
  assert.deepEqual(r.map(b => [b.label, b.count, b.amount]), [['0-30', 1, 100], ['31-60', 1, 50], ['61-90', 0, 0], ['90+', 1, 70]]);
});

test('sales per day: a quiet day is zero and a cancelled invoice never counts', () => {
  const r = salesByDay([{ date: now, total: 10, status: 'Issued' }, { date: now - D, total: 5 }, { date: now, total: 99, status: 'Cancelled' }], now, 3);
  assert.deepEqual(r, [{ day: '2026-10-21', total: 0 }, { day: '2026-10-22', total: 5 }, { day: '2026-10-23', total: 10 }]);
});
