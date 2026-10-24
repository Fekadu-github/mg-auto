// The gap-analysis fixes: labour rate per section, parts waiting for stock, prices that need the manager, completion mileage and next service
// from any service work, end-of-day clock-out, part search, the Manager role in the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../rules.js';
import { isServiceVisit, nextService, DEFAULT_SERVICES } from '../services.js';
import { cutoffFor, closeClocks, parseHm } from '../workday.js';
import { partSearchSql, rankParts, searchView } from '../stock.js';
import { lacksManagerRole, ROLE_ENUM } from '../sql.js';
import { loadConfig } from '../config.js';

const SA = { id: 'u1', name: 'Almaz', role: 'SA' }, MG = { id: 'u9', name: 'Mulu', role: 'MGR' }, TECH = { id: 'u3', name: 'Dawit', role: 'TECH' };
const job = (o = {}) => ({ id: 'TC-1', vid: 'v1', status: 'Created', labours: [], parts: [], inv: null, log: [], services: [], requests: [], ...o });
const err = (code, re) => e => e.code === code && re.test(e.message);
const TYPES = DEFAULT_SERVICES.map(({ code, name, interval_km }) => ({ code, name, interval_km }));
const EAT = 3 * 3600e3, at = (iso) => Date.parse(iso + 'Z') - EAT;   // an Addis Ababa wall-clock time as UTC ms

// ---- the Manager role must exist in the database ----
test('the users table accepts the Manager role (new databases) and old databases are upgraded', () => {
  assert.match(readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8'), /role ENUM\('SA','WS','TECH','ADMIN','MGR'\)/);
  assert.equal(lacksManagerRole("enum('SA','WS','TECH','ADMIN')"), true);
  assert.equal(lacksManagerRole("enum('SA','WS','TECH','ADMIN','MGR')"), false);
  assert.equal(ROLE_ENUM, "ENUM('SA','WS','TECH','ADMIN','MGR')");
});

// ---- labour rate per section ----
test('labour rate per section: the section decides the rate, a section without one uses the standard rate', () => {
  const rates = { default: 350, 'Body & Paints': 500, 'Regular Service': 300 };
  assert.deepEqual(['Body & Paints', 'Regular Service', 'Mechanical Repairs'].map(s => R.rateOf(rates, s)), [500, 300, 350]);
  assert.equal(R.rateOf(350, 'Body & Paints'), 350);                                     // one number still works
  const j = job();
  R.addLabour(j, { desc: 'Respray', hours: 2, section: 'Body & Paints' }, rates);
  R.addLabour(j, { desc: 'Oil change', hours: 1, section: 'Regular Service' }, rates);
  R.addLabour(j, { desc: 'Diagnosis', hours: 1, section: 'Mechanical Repairs' }, rates);
  R.addLabour(j, { desc: 'Typed', hours: 1, price: 999, section: 'Body & Paints' }, rates);
  assert.deepEqual(j.labours.map(l => l.price), [1000, 300, 350, 999]);
  const e = R.normalizeEstimate({ labours: [{ desc: 'Paint', hours: 2, section: 'Body & Paints' }, { desc: 'Other', hours: 1 }] }, rates);
  assert.deepEqual(e.labours.map(l => l.price), [1000, 350]);
});

// ---- parts waiting for stock ----
test('a part that is short waits for stock; the card cannot close or be invoiced until it is received or removed', () => {
  const j = job({ status: 'Back with SA' });
  R.addWaitingPart(j, { id: 'p1', code: 'TBRK-001', name: 'Brake pad', price: '2500.00' }, 2, '');
  assert.deepEqual(j.parts[0], { pid: 'p1', code: 'TBRK-001', name: 'Brake pad', qty: 2, price: 2500, waiting: true });
  assert.equal(R.waitingParts(j).length, 1);
  assert.throws(() => R.transition(j, 'Closed', SA), err(409, /waiting for stock/));
  assert.equal(R.waitingLine(j, 0).waiting, true);
  assert.throws(() => R.waitingLine(j, 3), err(404, /Part line/));
  delete j.parts[0].waiting;                                                         // what the server does when the stock has arrived
  assert.throws(() => R.waitingLine(j, 0), err(409, /not waiting/));
  R.transition(j, 'Closed', SA);
  assert.equal(j.status, 'Closed');
  j.parts[0].waiting = true;
  assert.throws(() => R.checkInvoice(j, 'Cash'), err(409, /waiting for stock/));
  R.checkInvoice(j, 'Proforma');                                                     // a proforma is only a quote: allowed
});

// ---- prices beyond the limit need the manager ----
test('price approval: within the limit the advisor decides, beyond it the manager approves; the manager is never limited', () => {
  const j = job({ status: 'Closed' });
  j.parts.push({ pid: 'p1', code: 'TOIL-001', name: 'Oil', qty: 1, price: 1000 });
  j.labours.push({ id: 'L1', desc: 'Respray', price: 2000, done: true });
  assert.equal(R.submitPartPrice(j, 0, 1090, SA, 10, 1), 'applied');                 // +9%
  assert.equal(j.parts[0].price, 1090);
  assert.equal(R.submitPartPrice(j, 0, 1400, SA, 10, 2, () => 0.5), 'pending');      // +40% of the list price (1000)
  assert.equal(j.parts[0].price, 1090);                                              // not changed yet
  assert.equal(R.pendingPrices(j).length, 1);
  assert.throws(() => R.transition(j, 'Closed', SA), err(409, /manager|Closed/));    // already Closed: the status error comes first
  assert.throws(() => R.checkInvoice(j, 'Cash'), err(409, /waiting for the manager/));
  assert.throws(() => R.decidePrice(j, j.price_reqs[0].id, true, SA), err(403, /Only the manager/));
  R.decidePrice(j, j.price_reqs[0].id, true, MG, 3);
  assert.equal(j.parts[0].price, 1400);
  assert.equal(R.pendingPrices(j).length, 0);
  assert.throws(() => R.decidePrice(j, j.price_reqs[0].id, true, MG), err(409, /already approved/));
  assert.equal(R.submitLabourPrice(j, 'L1', 3000, SA, 10, 4, () => 0.2), 'pending');
  R.decidePrice(j, j.price_reqs[1].id, false, MG, 5);
  assert.equal(j.labours[0].price, 2000);                                            // rejected: unchanged
  assert.equal(R.submitLabourPrice(j, 'L1', 5000, MG, 10, 6), 'applied');            // the manager is not limited
  assert.equal(R.submitPartPrice(j, 0, 5000, SA, 0, 7), 'applied');                  // limit 0 = no limit
  assert.equal(R.priceNeedsApproval(0, 50, 10), false);                              // a line with no list price has nothing to compare with
  assert.equal(R.submitPartPrice(j, 0, 5000, SA, 10, 8), 'unchanged');
});
test('price approval: a newer ask for the same line replaces the older one; an approval for a changed line is refused', () => {
  const j = job({ status: 'Closed' });
  j.parts.push({ name: 'Oil', qty: 1, price: 100 });
  R.submitPartPrice(j, 0, 200, SA, 10, 1, () => 0.1); R.submitPartPrice(j, 0, 300, SA, 10, 2, () => 0.2);
  assert.deepEqual(R.pendingPrices(j).map(r => r.to), [300]);
  j.parts[0] = { name: 'Something else', qty: 1, price: 100 };
  assert.throws(() => R.decidePrice(j, R.pendingPrices(j)[0].id, true, MG), err(409, /changed since/));
});

// ---- mileage when the vehicle leaves, and the next service from any service work ----
test('completion mileage: optional, never below the arrival reading; the next service counts from it', () => {
  const j = job({ mileage: 9800, status: 'Back with SA' });
  R.setMileageOut(j, '');                                                            // empty: the arrival reading stays
  assert.equal(R.completionKm(j), 9800);
  assert.throws(() => R.setMileageOut(j, 9000), err(400, /lower than/));
  R.setMileageOut(j, '10040');
  assert.equal(R.completionKm(j), 10040);
  assert.equal(nextService(R.completionKm(j), TYPES).km, 15000);                     // from 10 040 km, not from 9 800 km
  assert.equal(nextService(9800, TYPES).km, 10000);
});
test('a service typed in as ordinary labour counts as a service visit, like a Type A/B/C package', () => {
  assert.equal(isServiceVisit(job()), false);
  assert.equal(isServiceVisit(job({ services: ['A'] })), true);
  assert.equal(isServiceVisit(job({ labours: [{ id: 'L1', desc: 'Oil change', section: 'Regular Service' }] })), true);
  assert.equal(isServiceVisit(job({ labours: [{ id: 'L1', desc: 'Respray', section: 'Body & Paints' }] })), false);
});

// ---- details on the card ----
test('claim number, expected finish date and priority are kept until the invoice and logged', () => {
  const j = job();
  R.setDetails(j, { claim_no: ' CL-77 ', due_date: '2026-11-05', priority: 'Urgent' }, SA, 1);
  assert.deepEqual([j.claim_no, j.due_date, j.priority], ['CL-77', '2026-11-05', 'Urgent']);
  assert.equal(j.log.length, 1);
  R.setDetails(j, { claim_no: 'CL-77', due_date: '2026-11-05', priority: 'Urgent' }, SA, 2); assert.equal(j.log.length, 1);   // no change: nothing logged
  R.setDetails(j, { priority: 'Normal' }, SA, 3);
  assert.deepEqual([j.claim_no, j.due_date, j.priority], [null, null, null]);
  assert.throws(() => R.setDetails(j, { due_date: '05/11/2026' }, SA), err(400, /year-month-day/));
  j.inv = { no: 'INV-1' };
  assert.throws(() => R.setDetails(j, { claim_no: 'X' }, SA), err(409, /Already invoiced/));
});

// ---- end of the working day ----
test('end of day: a clock closes at the end of its working day; one started after it closes at midnight; "close all" closes everything now', () => {
  assert.equal(parseHm('17:30'), 1050); assert.equal(parseHm('7:05'), 425); assert.equal(parseHm('24:00'), null); assert.equal(parseHm(''), null);
  const end = parseHm('17:30');
  assert.equal(cutoffFor(at('2026-10-14T09:00:00'), end), at('2026-10-14T17:30:00'));
  assert.equal(cutoffFor(at('2026-10-14T18:10:00'), end), at('2026-10-15T00:00:00'));
  const mk = inMs => job({ labours: [{ id: 'L1', logs: [{ tech: 'Dawit', in: inMs }] }, { id: 'L2', logs: [{ tech: 'Biruk', in: inMs, out: inMs + 1000, reason: 'Lunch' }] }] });
  const a = mk(at('2026-10-14T09:00:00'));
  assert.equal(closeClocks([a], at('2026-10-14T17:00:00'), end), 0);                  // not yet
  assert.equal(closeClocks([a], at('2026-10-14T17:31:00'), end), 1);
  assert.deepEqual([a.labours[0].logs[0].out, a.labours[0].logs[0].reason], [at('2026-10-14T17:30:00'), 'End of work day']);
  assert.equal(a.labours[1].logs[0].reason, 'Lunch');                                // a finished clock is untouched
  assert.equal(closeClocks([a], at('2026-10-14T23:00:00'), end), 0);                  // closed once
  const b = mk(at('2026-10-14T09:00:00'));
  assert.equal(closeClocks([b], at('2026-10-14T10:00:00'), null, 'Mulu'), 1);         // the button: everything now
  assert.equal(b.labours[0].logs[0].out, at('2026-10-14T10:00:00'));
  assert.equal(b.log.at(-1).by, 'Mulu');
});

// ---- search by typing, on the server ----
test('part search: all typed words must match; wildcards typed by the user are not wildcards; ranking; technicians see no prices', () => {
  assert.equal(partSearchSql('   '), null);
  const s = partSearchSql('Brake 50%');
  assert.equal(s.params.length, 2);
  assert.deepEqual(s.params, ['%brake%', '%50\\%%']);
  assert.equal(s.where.split(' AND ').length, 2);
  const rows = [{ code: 'TOIL-001', name: 'Brake fluid' }, { code: 'TBRK-001', name: 'Brake Pad Set' }, { code: 'BBRK', name: 'x' }];
  assert.deepEqual(rankParts(rows, 'tbrk').map(p => p.code), ['TBRK-001', 'BBRK', 'TOIL-001']);
  assert.deepEqual(rankParts(rows, 'brake', 1).length, 1);
  assert.deepEqual(searchView({ id: '1', code: 'T1', name: 'N', price: 9, stock: 3, reorder: 1 }, true), { id: '1', code: 'T1', name: 'N', in_stock: true });
  assert.equal(searchView({ id: '1', code: 'T1', name: 'N', price: 9, stock: 3, reorder: 1 }, false).price, 9);
});

// ---- settings ----
test('settings: price limit defaults to 10 percent; WORK_END must be a time of day', () => {
  assert.deepEqual([loadConfig({}).priceLimitPct, loadConfig({ PRICE_LIMIT_PCT: '0' }).priceLimitPct, loadConfig({ PRICE_LIMIT_PCT: '-3' }).priceLimitPct], [10, 0, 10]);
  assert.deepEqual([loadConfig({ WORK_END: '17:30' }).workEnd, loadConfig({ WORK_END: '25:00' }).workEnd, loadConfig({}).workEnd], ['17:30', '', '']);
});

// ---- password read-back, photo clean-up, Type D ----
import { encryptPassword, decryptPassword } from '../passwords.js';
import { deliveredAt, photosExpired } from '../photos.js';
test('password round trip, wrong key and tampering give nothing', () => {
  const e = encryptPassword('Sup3r secret', 'key-1');
  assert.equal(decryptPassword(e, 'key-1'), 'Sup3r secret');
  assert.equal(decryptPassword(e, 'key-2'), null);
  assert.equal(decryptPassword(e.slice(0, -4) + 'AAAA', 'key-1'), null);
  assert.equal(decryptPassword(null, 'key-1'), null);
});
test('photos expire 5 days after delivery only', () => {
  const D = 86400e3, now = 100 * D, log = [{ s: 'Invoiced', t: now - 9 * D }, { s: 'Delivered', t: now - 5 * D }];
  assert.equal(deliveredAt(log), now - 5 * D);
  assert.equal(photosExpired(log, now, 5), true);
  assert.equal(photosExpired(log, now - D, 5), false);
  assert.equal(photosExpired([{ s: 'Invoiced', t: 1 }], now, 5), false);
  assert.equal(photosExpired(JSON.stringify(log), now, 5), true);
});
test('Type D exists with an editable package', () => {
  const d = DEFAULT_SERVICES.find(x => x.code === 'D');
  assert.ok(d && d.interval_km > 0 && d.labours.length && d.parts.length);
});
