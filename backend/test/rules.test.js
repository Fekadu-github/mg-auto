import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../rules.js';
import { splitSql } from '../sql.js';
import { loadConfig } from '../config.js';
import { readFileSync } from 'node:fs';

const SA = { id: 'u1', name: 'Almaz', role: 'SA' }, WS = { id: 'u2', name: 'Biruk', role: 'WS' };
const T1 = { id: 'u3', name: 'Dawit', role: 'TECH' }, T2 = { id: 'u4', name: 'Sara', role: 'TECH' }, ADMIN = { id: 'u5', name: 'Root', role: 'ADMIN' };
const job = (o = {}) => ({ id: 'TC-1', status: 'Created', labours: [], parts: [], inv: null, log: [], ...o });
const err = (code, re) => e => e.code === code && re.test(e.message);

test('labour: only before dispatch, needs a description, price from hours x rate unless typed', () => {
  const j = job();
  assert.throws(() => R.addLabour(j, { desc: ' ' }, 350), err(400, /Describe/));
  R.addLabour(j, { desc: 'Oil change', hours: 2, section: 'Regular Service' }, 350);
  R.addLabour(j, { desc: 'Weld', hours: 2, price: 500, section: 'nonsense' }, 350);
  assert.deepEqual(j.labours.map(l => [l.price, l.section]), [[700, 'Regular Service'], [500, 'Regular Service']]);
  assert.notEqual(j.labours[0].id, j.labours[1].id);
  R.removeLabour(j, j.labours[0].id); assert.equal(j.labours.length, 1);
  j.status = 'Dispatched';
  assert.throws(() => R.addLabour(j, { desc: 'x' }, 350), err(409, /before dispatch/));
  assert.throws(() => R.removeLabour(j, 'x'), err(409, /before dispatch/));
});

test('status flow: order, roles, and the two guards (labour present, all labour completed)', () => {
  const j = job();
  assert.throws(() => R.transition(j, 'Dispatched', SA), err(400, /at least one labour/));
  R.addLabour(j, { desc: 'A', price: 100 }, 350);
  assert.throws(() => R.transition(j, 'Dispatched', WS), err(403, /role/));
  assert.throws(() => R.transition(j, 'Closed', SA), err(409, /cannot move/));
  assert.throws(() => R.transition(j, 'Bogus', SA), err(409, /cannot move/));
  R.transition(j, 'Dispatched', SA, 1);
  assert.throws(() => R.transition(j, 'At workshop', SA), err(403, /role/));
  R.transition(j, 'At workshop', WS);
  assert.throws(() => R.transition(j, 'Work done', WS), err(400, /Every labour/));
  j.labours[0].done = true;
  R.transition(j, 'Work done', ADMIN);                       // an administrator may do any step
  R.transition(j, 'Back with SA', SA); R.transition(j, 'Closed', SA);
  assert.deepEqual(j.log.map(x => x.s), ['Dispatched', 'At workshop', 'Work done', 'Back with SA', 'Closed']);
  assert.equal(j.log[0].t, 1); assert.equal(j.log[0].by, 'Almaz');
});

const shop = () => { const j = job({ status: 'At workshop' }); R.addLabour(Object.assign(j, { status: 'Created' }), { desc: 'Brakes', price: 100 }, 350); j.status = 'At workshop'; return j; };

test('clock in: workshop only, one running clock per person across job cards, not on completed labour', () => {
  const j = shop(), lid = j.labours[0].id;
  assert.throws(() => R.clockIn(job({ labours: j.labours }), lid, T1), err(409, /not in the workshop/));
  assert.throws(() => R.clockIn(j, 'nope', T1), err(404, /Labour not found/));
  R.clockIn(j, lid, T1, [], 10);
  assert.throws(() => R.clockIn(j, lid, T2), err(409, /Someone is already/));
  // Dawit is clocked in on TC-1, so he cannot start on TC-2
  const other = { id: 'TC-2', labours: [{ id: 'L9', desc: 'Tyres', done: false, logs: [] }] };
  assert.throws(() => R.clockIn(job({ id: 'TC-2', status: 'At workshop', labours: other.labours }), 'L9', T1, [j]), err(409, /still clocked in on TC-1/));
  R.clockIn(job({ id: 'TC-2', status: 'At workshop', labours: other.labours }), 'L9', T2, [j]);   // Sara is free
  // the same check from the other side: Dawit's clock is on `others`
  const j2 = job({ id: 'TC-2', status: 'At workshop', labours: [{ id: 'L9', desc: 'Tyres', done: false, logs: [] }] });
  assert.throws(() => R.clockIn(j2, 'L9', T1, [j]), err(409, /still clocked in/));
  R.clockOut(j, lid, 'Completed', T1, 20);
  assert.throws(() => R.clockIn(j, lid, T1), err(409, /completed/));
});

test('clock out: reason required, own clock only for technicians, supervisor command for WS/ADMIN, Completed finishes the labour', () => {
  const j = shop(), lid = j.labours[0].id;
  assert.throws(() => R.clockOut(j, lid, 'Lunch', T1), err(409, /Nobody is clocked in/));
  R.clockIn(j, lid, T1, [], 10);
  assert.throws(() => R.clockOut(j, lid, 'Coffee', T1), err(400, /reason/));
  assert.throws(() => R.clockOut(j, lid, 'Lunch', T2), err(403, /another technician/));
  assert.throws(() => R.clockOut(j, lid, 'Supervisor command', T1), err(403, /supervisor/));
  R.clockOut(j, lid, 'Supervisor command', WS, 30);
  assert.deepEqual(j.labours[0].logs[0], { tech: 'Dawit', in: 10, out: 30, reason: 'Supervisor command' });
  assert.equal(j.labours[0].done, false);
  R.clockIn(j, lid, T2, [], 40); R.clockOut(j, lid, 'Completed', T2, 50);
  assert.equal(j.labours[0].done, true);
});

test('parts: free text is not tracked, closed cards refuse changes, removing returns the line', () => {
  const j = job();
  assert.throws(() => R.addFreePart(j, { name: '' }), err(400, /Part name/));
  R.addFreePart(j, { name: 'Bulb', qty: 2, price: 50 });
  R.addStockPart(j, { id: 'p1', code: 'OIL-001', name: 'Oil', price: '450.00' }, 3);
  assert.deepEqual(j.parts[1], { pid: 'p1', code: 'OIL-001', name: 'Oil', qty: 3, price: 450 });
  assert.equal(R.partQty(0), 1); assert.equal(R.partQty('2.456'), 2.46); assert.equal(R.partQty(-5), 0.01);
  assert.throws(() => R.removePartLine(j, 7), err(404, /Part line/));
  assert.throws(() => R.removePartLine(j, 'x'), err(404, /Part line/));
  assert.equal(R.removePartLine(j, 1).pid, 'p1'); assert.equal(j.parts.length, 1);
  j.status = 'Closed';
  assert.throws(() => R.addFreePart(j, { name: 'x' }), err(409, /closed/));
  assert.throws(() => R.removePartLine(j, 0), err(409, /closed/));
});

test('invoice: only after closing, one cash/credit invoice, many proformas, amounts frozen', () => {
  const j = job({ status: 'Back with SA', labours: [{ price: 1000 }], parts: [{ qty: 2, price: 100 }] });
  assert.throws(() => R.issueInvoice(j, 'Cash', 0.15, 'INV-1', SA), err(409, /Close the job card/));
  j.status = 'Closed';
  assert.throws(() => R.issueInvoice(j, 'Gift', 0.15, 'INV-1', SA), err(400, /Choose/));
  const pf = R.issueInvoice(j, 'Proforma', 0.15, 'INV-1', SA, 5);
  assert.equal(j.status, 'Closed'); assert.equal(j.inv, null); assert.equal(pf.totals.total, 1380);
  R.issueInvoice(j, 'Proforma', 0.15, 'INV-2', SA);                    // can be printed again
  const d = R.issueInvoice(j, 'Cash', 0.15, 'INV-3', SA, 9);
  assert.equal(j.status, 'Invoiced'); assert.equal(j.inv, d); assert.deepEqual(d.totals, { labour: 1000, parts: 200, sub: 1200, vat: 180, total: 1380, rate: 0.15 });
  assert.throws(() => R.issueInvoice(j, 'Credit', 0.15, 'INV-4', SA), err(409, /Already invoiced \(INV-3\)/));
  R.transition(j, 'Delivered', SA);
  assert.equal(j.status, 'Delivered');
});

test('config: defaults and bad values', () => {
  const c = loadConfig({});
  assert.equal(c.vat, 0.15); assert.equal(c.labourRate, 350); assert.equal(c.port, 3000); assert.equal(c.corsOrigin, '*');
  assert.equal(loadConfig({ VAT_RATE: '1.5' }).vat, 0.15); assert.equal(loadConfig({ VAT_RATE: '0.05' }).vat, 0.05);
  assert.equal(loadConfig({ LABOUR_RATE: '-3' }).labourRate, 350); assert.equal(loadConfig({ VAT_RATE: '0' }).vat, 0);
  assert.equal(loadConfig({ RENDER_EXTERNAL_URL: 'https://x.onrender.com' }).telegram.publicUrl, 'https://x.onrender.com');
});

test('schema.sql splits into whole statements with no comments left', () => {
  const st = splitSql(readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
  assert.equal(st.length, 8);
  assert.ok(st.every(s => /^CREATE TABLE IF NOT EXISTS/.test(s) && !s.includes('--') && s.endsWith('utf8mb4')));
  assert.deepEqual(splitSql("a; -- x\nb;\n\n-- only a comment\n"), ['a', 'b']);
});
