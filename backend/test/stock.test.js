import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../stock.js';

test('part numbers: S, T, B decide the make; any other number is a general part with no model', () => {
  assert.equal(S.makeOf('s-100'), 'Suzuki'); assert.equal(S.makeOf('T123'), 'Toyota'); assert.equal(S.makeOf(' B9'), 'BYD'); assert.equal(S.makeOf('X1'), '');
  assert.doesNotThrow(() => S.assertPartNo('X-1')); assert.doesNotThrow(() => S.assertPartNo('OIL-5W30'));
  assert.throws(() => S.assertPartNo('  '), /missing/);
  assert.doesNotThrow(() => S.assertPartNo('t-9'));
});

test('price is cost x 1.3 unless a price is typed', () => {
  assert.equal(S.priceFromCost(100), 130); assert.equal(S.priceFromCost(33.33), 43.33); assert.equal(S.priceFromCost(''), 0);
  const a = S.itemForm({ code: 't-1', name: 'Filter', cost: '200' }, 1.3);
  assert.equal(a.code, 'T-1'); assert.equal(a.cost, 200); assert.equal(a.price, 260); assert.equal(a.priceGiven, false);
  const b = S.itemForm({ code: 'S-2', name: 'Pad', cost: 200, price: 300, stock: 5, reorder: 2 }, 1.3);
  assert.equal(b.price, 300); assert.equal(b.priceGiven, true); assert.equal(b.qty, 5); assert.equal(b.reorder, 2);
  const oil = S.itemForm({ code: 'oil-5w30', name: 'Engine oil', category: 'Oil' });
  assert.deepEqual([oil.code, oil.cost, oil.price, oil.qty, oil.category], ['OIL-5W30', 0, 0, 0, 'Oil']);   // no model, starts at 0
  assert.throws(() => S.itemForm({ code: 'S-1', name: '' }), /required/);
  assert.throws(() => S.itemForm({ code: 'S-1', name: 'x', cost: -1 }), /zero or more/);
  assert.equal(S.itemForm({ name: 'New name', cost: 10 }, 1.3, { isNew: false }).price, 13);
});

test('import: loose headers, new and existing parts, errors by row', () => {
  const have = new Map([['T-1', { id: 'p1', code: 'T-1', name: 'Old name', cost: 100, price: 130, stock: 4, reorder: 1, category: '' }]]);
  const { items, errors } = S.parseImport([
    { 'Part Number': 't-1', Description: 'Oil filter', Qty: 10, Cost: 120 },            // existing: cost changed -> price follows, stock set to 10
    { 'Part No.': 'S-77', 'Part Description': 'Brake pad', Quantity: '3', 'Unit Cost': '1,000', 'Selling Price': '1500', 'Min Stock': 2 },
    { code: 'B-5', name: 'BYD lamp', cost: 50 },                                         // price filled: 65
    { code: 'OIL-5W30', name: 'Engine oil 5W-30', category: 'Oil' },                 // no model: accepted as it is, cost price and quantity start at 0
    { code: '', name: 'No code', cost: 5 },
    { code: 'S-77', name: 'Repeated' },
    { code: 'S-80' },                                                                     // no description
    {}, { foo: 'bar' }                                                                   // empty rows and unknown columns are skipped
  ], 1.3, have);
  assert.equal(items.length, 4);
  const [a, b, c, d] = items;
  assert.deepEqual([a.action, a.id, a.cost, a.price, a.qty, a.name], ['update', 'p1', 120, 156, 10, 'Oil filter']);
  assert.deepEqual([b.action, b.cost, b.price, b.qty, b.reorder], ['new', 1000, 1500, 3, 2]);
  assert.deepEqual([c.action, c.cost, c.price, c.qty], ['new', 50, 65, 0]);
  assert.deepEqual([d.action, d.code, d.category, d.cost, d.price, d.qty], ['new', 'OIL-5W30', 'Oil', 0, 0, 0]);
  assert.deepEqual(errors.map(e => [e.line, /missing|repeated/.test(e.error)]), [[6, true], [7, true], [8, true]]);
  // an existing part with only a new quantity keeps its cost and price
  const keep = S.parseImport([{ code: 'T-1', qty: 7 }], 1.3, have).items[0];
  assert.equal(keep.cost, undefined); assert.equal(keep.price, undefined); assert.equal(keep.name, 'Old name'); assert.equal(keep.qty, 7);
  assert.throws(() => S.parseImport('x'), /No rows/);
});

test('all prices by the same percentage', () => {
  assert.equal(S.bumpPrice(100, 10), 110); assert.equal(S.bumpPrice(100, -5), 95); assert.equal(S.bumpPrice(33.33, 10), 36.66);
  assert.equal(S.bulkPercent('7.5'), 7.5);
  for (const bad of [0, '', 'x', -90, -120, 5000]) assert.throws(() => S.bulkPercent(bad));
});

test('sale lines and totals', () => {
  assert.deepEqual(S.cleanSaleLines([{ pid: 'b', qty: 1 }, { pid: 'a', qty: '2' }, { pid: 'b', qty: 1.5 }]), [{ pid: 'a', qty: 2 }, { pid: 'b', qty: 2.5 }]);
  assert.throws(() => S.cleanSaleLines([]), /at least one/); assert.throws(() => S.cleanSaleLines([{ pid: 'a', qty: 0 }]), /above zero/); assert.throws(() => S.cleanSaleLines([{ qty: 1 }]), /above zero/);
  assert.deepEqual(S.saleTotals([{ qty: 2, price: 100 }, { qty: 1, price: 50.5 }], 0.15), { sub: 250.5, vat: 37.57, total: 288.07, rate: 0.15 });
});

test('reports: sales, inventory control, lost sales, invoice status', () => {
  const t0 = Date.parse('2026-10-10T08:00:00Z'), a = Date.parse('2026-10-10T00:00:00Z'), b = a + 864e5 * 2;
  const mk = (id, kind, status, total, t, lines) => ({ id, kind, status, created: new Date(t), cust_name: 'X', cust_tin: '', by_name: 'u', totals: { sub: total / 1.15, vat: total - total / 1.15, total, rate: 0.15 }, lines });
  const r = S.salesReport([
    mk('I1', 'Cash', 'Issued', 115, t0, [{ code: 'T-1', name: 'a', qty: 1, price: 100 }]),
    mk('I2', 'Credit', 'Issued', 230, t0 + 864e5, [{ code: 'T-1', name: 'a', qty: 2, price: 100 }]),
    mk('I3', 'Cash', 'Cancelled', 50, t0, []), mk('P1', 'Proforma', 'Issued', 999, t0, []), mk('I4', 'Cash', 'Issued', 10, t0 + 864e5 * 5, [])], a, b);
  assert.equal(r.sum.count, 2); assert.equal(r.sum.cash, 115); assert.equal(r.sum.credit, 230); assert.equal(r.cancelled.count, 1); assert.deepEqual(r.items, [{ code: 'T-1', name: 'a', qty: 3, amount: 300 }]);
  assert.equal(r.days.length, 2);
  const inv = S.inventoryReport([{ id: 'p1', code: 'T-1', name: 'a', stock: 0, reorder: 2, cost: 10, price: 13 }, { id: 'p2', code: 'S-1', name: 'b', stock: 2, reorder: 2, cost: 5, price: 7 }, { id: 'p3', code: 'B-1', name: 'c', stock: 9, reorder: 2, cost: 5, price: 7 }],
    [{ part_id: 'p1', reason: 'GRN', delta: 10 }, { part_id: 'p1', reason: 'Sold', delta: -10 }, { part_id: 'p1', reason: 'Sale cancelled', delta: 1 }, { part_id: 'p1', reason: 'Adjusted', delta: -1 }]);
  assert.deepEqual(inv.items.map(i => [i.code, i.status]), [['B-1', 'OK'], ['S-1', 'Low'], ['T-1', 'Out of stock']]);
  const t1 = inv.items[2];
  assert.deepEqual([t1.received, t1.sold, t1.returned, t1.adjusted], [10, -10, 1, -1]);
  assert.deepEqual(inv.sum, { items: 3, units: 11, value_cost: 55, value_price: 77, low: 1, out: 1 });
  const lost = S.lostReport([{ code: 'T-1', name: 'a', qty: 2, price: 10 }, { code: 'T-1', name: 'a', qty: 1, price: 10 }, { code: '', name: 'Wiper blade', qty: 1, price: 0 }]);
  assert.deepEqual(lost.items[0], { code: 'T-1', name: 'a', attempts: 2, qty: 3, value: 30 }); assert.equal(lost.count, 3);
  assert.deepEqual(['Paid', 'Part paid', 'Unpaid', 'Cancelled'], [S.invoiceStatus(100, 100), S.invoiceStatus(100, 40), S.invoiceStatus(100, 0), S.invoiceStatus(100, 0, true)]);
});
