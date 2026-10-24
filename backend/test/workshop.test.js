// The garage-workflow rules: selling prices, mileage and next service, service packages, estimates, and part requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../rules.js';
import { DEFAULT_SERVICES, milestoneType, nearestService, nextService, normalizeService } from '../services.js';

const SA = { id: 'u1', name: 'Almaz', role: 'SA' }, WS = { id: 'u2', name: 'Biruk', role: 'WS' }, T1 = { id: 'u3', name: 'Dawit', role: 'TECH' };
const job = (o = {}) => ({ id: 'TC-1', vid: 'v1', status: 'Created', labours: [], parts: [], inv: null, log: [], services: [], requests: [], ...o });
const err = (code, re) => e => e.code === code && re.test(e.message);
const TYPES = DEFAULT_SERVICES.map(({ code, name, interval_km }) => ({ code, name, interval_km }));

// ---- 1. selling price editable until the invoice ----
test('selling price: parts and labour can be changed until invoiced; the catalogue price is kept; changes are logged', () => {
  const j = job({ status: 'Closed' });
  j.parts.push({ pid: 'p1', code: 'OIL', name: 'Oil', qty: 2, price: 450 }, { name: 'Bulb', qty: 1, price: 50 });
  j.labours.push({ id: 'L1', desc: 'Brakes', price: 700 });
  R.setPartPrice(j, 0, 500, SA, 7); R.setPartPrice(j, 1, '60', SA);
  R.setLabourPrice(j, 'L1', 800, SA);
  assert.deepEqual([j.parts[0].price, j.parts[0].list, j.parts[1].price, j.parts[1].list, j.labours[0].price], [500, 450, 60, undefined, 800]);
  assert.deepEqual(j.log[0], { s: 'Price changed', t: 7, by: 'Almaz', note: 'Oil: 450 to 500' });
  R.setPartPrice(j, 0, 500, SA); assert.equal(j.log.length, 3);                       // same price: nothing to log
  assert.throws(() => R.setPartPrice(j, 0, '', SA), err(400, /Enter a price/));
  assert.throws(() => R.setPartPrice(j, 0, -1, SA), err(400, /zero or more/));
  assert.throws(() => R.setPartPrice(j, 9, 10, SA), err(404, /Part line/));
  assert.throws(() => R.setLabourPrice(j, 'nope', 10, SA), err(404, /Labour not found/));
  j.inv = { no: 'INV-1', type: 'Cash' };
  assert.throws(() => R.setPartPrice(j, 0, 1, SA), err(409, /Already invoiced \(INV-1\)/));
  assert.throws(() => R.setLabourPrice(j, 'L1', 1, SA), err(409, /Already invoiced/));
});

test('a part issued from stock can carry a typed selling price; without one the catalogue price is used', () => {
  const j = job(), oil = { id: 'p1', code: 'OIL', name: 'Oil', price: '450.00' };
  R.addStockPart(j, oil, 1); R.addStockPart(j, oil, 1, 520); R.addStockPart(j, oil, 1, ''); R.addStockPart(j, oil, 1, 'abc');
  assert.deepEqual(j.parts.map(p => [p.price, p.list]), [[450, undefined], [520, 450], [450, undefined], [0, 450]]);
});

// ---- 2. mileage and the next service ----
test('mileage: whole km, not negative, never below the last recorded reading', () => {
  assert.deepEqual(['12000', 12000.4, '', null, 'abc', -5, 3e6].map(R.cleanKm), [12000, 12000, null, null, null, null, null]);
  assert.equal(R.cleanKm(0), 0);
  assert.equal(R.checkMileage(5000, 4000), 5000); assert.equal(R.checkMileage(5000, null), 5000); assert.equal(R.checkMileage(4000, 4000), 4000);
  assert.throws(() => R.checkMileage(null, 100), err(400, /Enter the vehicle mileage/));
  assert.throws(() => R.checkMileage(3999, 4000), err(400, /lower than the last recorded 4000 km/));
});

test('next service: milestones belong to the largest interval that divides them (A 5 000, B 10 000, C 20 000, D 40 000)', () => {
  assert.deepEqual([5000, 10000, 15000, 20000, 40000, 25000].map(k => milestoneType(k, TYPES).code), ['A', 'B', 'A', 'C', 'D', 'A']);   // 40 000 is now the Type D milestone
  assert.equal(milestoneType(7000, TYPES), null);
  assert.deepEqual(nextService(5000, TYPES), { km: 10000, code: 'B', name: 'Type B service' });   // after an A at 5 000 comes the B at 10 000
  assert.deepEqual(nextService(10000, TYPES), { km: 15000, code: 'A', name: 'Type A service' });
  assert.deepEqual(nextService(15000, TYPES), { km: 20000, code: 'C', name: 'Type C service' });
  assert.deepEqual(nextService(20000, TYPES), { km: 25000, code: 'A', name: 'Type A service' });
  assert.equal(nextService(12345, TYPES).km, 15000);
  assert.equal(nextService(0, TYPES).km, 5000);
  assert.equal(nextService(-1, TYPES), null); assert.equal(nextService('x', TYPES), null); assert.equal(nextService(100, []), null);
  assert.equal(nextService(100, [{ code: 'Z', name: 'z', interval_km: 0 }]), null);
});

test('first visit of a vehicle with no history: the closest milestone is suggested', () => {
  assert.deepEqual([0, 4800, 5200, 7400, 7600, 9800, 19000].map(k => nearestService(k, TYPES).code + nearestService(k, TYPES).km), ['A5000', 'A5000', 'A5000', 'A5000', 'B10000', 'B10000', 'C20000']);
  assert.equal(nearestService(-3, TYPES), null);
});

// ---- 3. service packages ----
test('service package: cleaned, needs a name, a km interval and at least one line', () => {
  const ok = normalizeService({ name: ' Type A ', interval_km: '5000.4', labours: [{ desc: 'Oil change', hours: '0.75' }, { desc: ' ' }], parts: [{ code: 'oil-001', qty: 4 }, { name: 'Wipers' }, {}] });
  assert.deepEqual(ok, { name: 'Type A', interval_km: 5000, labours: [{ desc: 'Oil change', hours: 0.75, price: 0 }], parts: [{ code: 'OIL-001', name: '', qty: 4, price: 0 }, { code: '', name: 'Wipers', qty: 1, price: 0 }] });
  assert.throws(() => normalizeService({ name: '', interval_km: 5000, labours: [{ desc: 'x' }] }), err(400, /name/));
  assert.throws(() => normalizeService({ name: 'A', interval_km: 0, labours: [{ desc: 'x' }] }), err(400, /interval/));
  assert.throws(() => normalizeService({ name: 'A', interval_km: 5000 }), err(400, /at least one/));
});

test('service package: once per card, only before the vehicle is received in the workshop', () => {
  const j = job();
  R.assertServiceOpen(j, 'A'); j.services.push('A');
  assert.throws(() => R.assertServiceOpen(j, 'A'), err(409, /already on this job card/));
  R.assertServiceOpen(j, 'B');
  j.status = 'Dispatched'; R.assertServiceOpen(j, 'B');
  j.status = 'At workshop';
  assert.throws(() => R.assertServiceOpen(j, 'B'), err(409, /received in the workshop/));
});

// ---- 4 and 7. estimates: draft and finalized, loaded by number ----
const CAT = new Map([['p1', { id: 'p1', code: 'PNT-1', name: 'Paint', price: 900 }]]);
test('estimate lines: labour price from hours x rate unless typed; stock parts take name, code and price from the catalogue', () => {
  const e = R.normalizeEstimate({ note: ' dent ', labours: [{ desc: 'Panel beating', hours: 3 }, { desc: 'Respray', hours: 2, price: 1500 }, { desc: '' }],
    parts: [{ pid: 'p1', qty: 2 }, { pid: 'p1', qty: 1, price: 1000 }, { name: 'Clips', qty: 4, price: 5 }, { name: '' }, { pid: 'gone', name: 'Old part', qty: 1 }] }, 350, CAT);
  assert.equal(e.note, 'dent');
  assert.deepEqual(e.labours, [{ desc: 'Panel beating', hours: 3, price: 1050 }, { desc: 'Respray', hours: 2, price: 1500 }]);
  assert.deepEqual(e.parts, [{ pid: 'p1', code: 'PNT-1', name: 'Paint', qty: 2, price: 900 }, { pid: 'p1', code: 'PNT-1', name: 'Paint', qty: 1, price: 1000 },
    { name: 'Clips', qty: 4, price: 5 }, { name: 'Old part', qty: 1, price: 0 }]);
});

test('estimate: draft can change, finalize needs lines, finalized is locked and can go back to draft until it is used', () => {
  const e = { id: 'EST-1', status: 'Draft', labours: [], parts: [], used_in: null };
  R.assertDraft(e);
  assert.throws(() => R.checkFinalize(e), err(400, /Add labour or parts/));
  e.labours.push({ desc: 'x', price: 1 }); R.checkFinalize(e); e.status = 'Finalized';
  assert.throws(() => R.assertDraft(e), err(409, /finalized/));
  assert.throws(() => R.checkFinalize(e), err(409, /finalized/));
  R.checkReopen(e); e.used_in = 'TC-9';
  assert.throws(() => R.checkReopen(e), err(409, /already loaded on TC-9/));
  assert.throws(() => R.checkReopen({ id: 'EST-2', status: 'Draft' }), err(409, /already a draft/));
});

test('loading an estimate by its number: finalized, unused, same vehicle, card not in the workshop and not invoiced', () => {
  const e = { id: 'EST-1', vid: 'v1', status: 'Finalized', used_in: null }, j = job();
  R.checkEstimateImport(j, e);
  assert.throws(() => R.checkEstimateImport(j, undefined), err(404, /not found/));
  assert.throws(() => R.checkEstimateImport(j, { ...e, status: 'Draft' }), err(409, /still a draft/));
  assert.throws(() => R.checkEstimateImport(j, { ...e, used_in: 'TC-2' }), err(409, /already loaded on TC-2/));
  assert.throws(() => R.checkEstimateImport(j, { ...e, vid: 'v2' }), err(409, /different vehicle/));
  assert.throws(() => R.checkEstimateImport(job({ status: 'At workshop' }), e), err(409, /not in the workshop/));
  assert.throws(() => R.checkEstimateImport(job({ inv: { no: 'INV-1' } }), e), err(409, /before the invoice/));
  for (const status of ['Dispatched', 'Back with SA', 'Closed']) R.checkEstimateImport(job({ status, est: 'EST-0' }), e);   // a second estimate may follow
});

test('a finalized estimate made before any customer was registered (no vehicle yet) can be loaded on any card', () => {
  const e = { id: 'EST-7', cid: null, vid: null, status: 'Finalized', used_in: null };
  R.checkEstimateImport(job(), e);
  assert.throws(() => R.checkEstimateImport(job(), { ...e, status: 'Draft' }), err(409, /still a draft/));
  assert.throws(() => R.checkEstimateImport(job(), { ...e, used_in: 'TC-2' }), err(409, /already loaded on TC-2/));
});

// ---- 6. additional parts: the workshop asks, the Service Advisor issues ----
test('part requests: asked in the workshop, settled once, and they block closing until the Service Advisor answers', () => {
  const j = job({ status: 'Dispatched' });
  assert.throws(() => R.requestPart(j, { name: 'Bolt' }, 1, T1), err(409, /in the workshop/));
  j.status = 'At workshop';
  assert.throws(() => R.requestPart(j, { name: ' ' }, 1, T1), err(400, /which part/));
  R.requestPart(j, { name: 'Brake pad', pid: 'p9', code: 'BRK' }, '2', T1, 10); R.requestPart(j, { name: 'Bolt' }, 0, WS, 11);
  assert.deepEqual(j.requests.map(r => [r.name, r.qty, r.by, r.status]), [['Brake pad', 2, 'Dawit', 'Requested'], ['Bolt', 1, 'Biruk', 'Requested']]);
  assert.notEqual(j.requests[0].id, j.requests[1].id);
  assert.equal(R.pendingRequests(j).length, 2);

  // the card cannot be closed while a request is waiting
  j.status = 'Back with SA';
  assert.throws(() => R.transition(j, 'Closed', SA), err(409, /pending part requests/));
  const r0 = R.openRequest(j, j.requests[0].id); R.settleRequest(j, r0, 'Issued', SA, 20);
  assert.deepEqual([r0.status, r0.by2, r0.t2], ['Issued', 'Almaz', 20]);
  assert.throws(() => R.openRequest(j, r0.id), err(409, /already issued/));
  assert.throws(() => R.openRequest(j, 'nope'), err(404, /request not found/));
  assert.throws(() => R.transition(j, 'Closed', SA), err(409, /pending/));
  R.settleRequest(j, R.openRequest(j, j.requests[1].id), 'Rejected', SA);
  R.transition(j, 'Closed', SA); assert.equal(j.status, 'Closed');
});

// ---- 8, 9. clocking: a service package is clocked as one job, every other task on its own ----
test('clock: a Type A/B/C package is clocked once for all its lines; BP and ME tasks are clocked one by one', () => {
  const j = job({ status: 'At workshop' });
  j.labours.push({ id: 'L1', desc: 'A: oil', svc: 'A', section: 'Regular Service', done: false, logs: [] }, { id: 'L2', desc: 'A: inspection', svc: 'A', section: 'Regular Service', done: false, logs: [] },
    { id: 'L3', desc: 'Panel beating', section: 'Body & Paints', done: false, logs: [] }, { id: 'L4', desc: 'Brake pads', section: 'Mechanical Repairs', done: false, logs: [] });
  R.clockIn(j, 'L2', T1, [], 100);                                                          // asked on the second line: the clock runs on the package's first line
  assert.equal(j.labours[0].logs.length, 1); assert.equal(j.labours[1].logs.length, 0);
  assert.throws(() => R.clockIn(j, 'L3', T1, [], 101), err(409, /still clocked in/));      // one running clock per technician
  R.clockOut(j, 'L1', 'Completed', T1, 200);
  assert.deepEqual(j.labours.map(l => l.done), [true, true, false, false]);               // the whole package is completed
  R.clockIn(j, 'L3', T1, [], 300); R.clockOut(j, 'L3', 'Completed', T1, 400);
  assert.deepEqual(j.labours.map(l => l.done), [true, true, true, false]);                // other tasks need their own clock
  assert.throws(() => R.transition(j, 'Work done', WS), err(400, /Every labour/));
});

// ---- 10, 11. the advisor adds tasks and parts after the work and sends the card back: the new tasks must be clocked and completed ----
test('after the work: an added task is an additional task for the workshop (not done, needs a clock); only "billing only" lines are born done', () => {
  const j = job({ status: 'Back with SA', log: [{ s: 'Work done', t: 1, by: 'Biruk' }] });
  R.addLabour(j, { desc: 'Extra paint', section: 'Body & Paints', hours: 1 }, 350);
  assert.deepEqual([j.labours[0].done, j.labours[0].late, j.labours[0].extra, j.labours[0].price], [false, undefined, true, 350]);
  R.addLabour(j, { desc: 'Wash fee', section: 'Regular Service', price: 50, billing: true }, 350);          // a fee that needs no work
  assert.deepEqual([j.labours[1].done, j.labours[1].late, j.labours[1].extra], [true, true, undefined]);

  // it cannot be closed, and no cash / credit invoice can be issued, while the additional task is not done
  assert.throws(() => R.transition(j, 'Closed', SA), err(409, /not done yet/));
  j.status = 'Closed'; assert.throws(() => R.checkInvoice(j, 'Cash'), err(409, /not done yet/)); R.checkInvoice(j, 'Proforma'); j.status = 'Back with SA';

  R.returnToWorkshop(j, SA, 50);
  assert.equal(j.status, 'Dispatched'); assert.deepEqual(j.log.at(-1), { s: 'Returned to workshop', t: 50, by: 'Almaz', note: '1 additional task to clock' });
  R.addLabour(j, { desc: 'Rear bumper', section: 'Body & Paints', hours: 2 }, 350);                        // added after the return: also an additional task
  assert.deepEqual([j.labours[2].done, j.labours[2].late, j.labours[2].extra], [false, undefined, true]);
  R.transition(j, 'At workshop', WS);
  assert.throws(() => R.clockIn(j, j.labours[1].id, T1, [], 5), err(409, /completed/));                      // the billing line is never clocked
  assert.throws(() => R.transition(j, 'Work done', WS), err(400, /Every labour/));                           // the technicians have not done the new tasks
  R.clockIn(j, j.labours[0].id, T1, [], 10); R.clockOut(j, j.labours[0].id, 'Completed', T1, 20);
  assert.throws(() => R.removeLabour(j, j.labours[0].id), err(409, /Labour cannot be removed|not in the workshop|in the workshop/));
  assert.throws(() => R.transition(j, 'Work done', WS), err(400, /Every labour/));                           // one more is still open
  R.clockIn(j, j.labours[2].id, T1, [], 30); R.clockOut(j, j.labours[2].id, 'Completed', T1, 40);
  R.transition(j, 'Work done', WS); R.transition(j, 'Back with SA', SA); R.transition(j, 'Closed', SA);      // now every task is done
  assert.ok(j.labours[0].logs.length === 1 && j.labours[2].logs.length === 1);                              // each additional task has its own clock record
  R.returnToWorkshop(j, SA);                                                                              // a closed card can go back too
  assert.equal(j.log.at(-1).note, undefined);                                                             // nothing new waiting: no note
  j.status = 'Closed'; j.inv = { no: 'INV-1' };
  assert.throws(() => R.returnToWorkshop(j, SA), err(409, /Already invoiced/));
  assert.throws(() => R.addLabour(j, { desc: 'x' }, 350), err(409, /Already invoiced/));
  assert.throws(() => R.returnToWorkshop(job({ status: 'At workshop' }), SA), err(409, /with the Service Advisor/));
  assert.throws(() => R.returnToWorkshop(job({ status: 'Back with SA' }), T1), err(403, /role/));
});

test('a task added before the first workshop visit is a normal task, and a clocked additional task cannot be removed', () => {
  const j = job({ status: 'Created' });
  R.addLabour(j, { desc: 'Oil change', section: 'Regular Service', hours: 1 }, 300);
  assert.deepEqual([j.labours[0].done, j.labours[0].extra], [false, undefined]);
  const k = job({ status: 'Back with SA', log: [{ s: 'Work done', t: 1, by: 'Biruk' }] });
  R.addLabour(k, { desc: 'Extra', section: 'Body & Paints', hours: 1 }, 350);
  k.labours[0].logs.push({ tech: 'x', in: 1, out: 2 });
  assert.throws(() => R.removeLabour(k, k.labours[0].id), err(409, /clocked/));
});

// ---- the workshop supervisor assigns tasks to technicians ----
test('assign: the supervisor picks technicians for tasks; only they (and the supervisor) can clock in; an unassigned task stays open', () => {
  const T2 = { id: 'u4', name: 'Abel', role: 'TECH' }, T3 = { id: 'u5', name: 'Hana', role: 'TECH' };
  const j = job({ status: 'At workshop', labours: [
    { id: 'L1', desc: 'Brake pads', section: 'Mechanical Repairs', price: 100, done: false, logs: [] },
    { id: 'L2', desc: 'Panel beating', section: 'Body & Paints', price: 200, done: false, logs: [] },
    { id: 'L3', desc: 'Type A: oil', section: 'Regular Service', price: 50, done: false, logs: [], svc: 'A' },
    { id: 'L4', desc: 'Type A: filter', section: 'Regular Service', price: 50, done: false, logs: [], svc: 'A' }] });
  assert.throws(() => R.assignLabour(j, ['L1'], [T1], SA), err(403, /supervisor/));                      // the advisor does not assign
  assert.throws(() => R.assignLabour(j, [], [T1], WS), err(400, /at least one task/));
  assert.throws(() => R.assignLabour(j, ['nope'], [T1], WS), err(404, /not found/));
  R.assignLabour(j, ['L1'], [T1, T2, T1], WS, 5);                                                          // two technicians, the duplicate is ignored
  assert.deepEqual(j.labours[0].assigned, [{ id: 'u3', name: 'Dawit' }, { id: 'u4', name: 'Abel' }]);
  assert.deepEqual(j.log.at(-1), { s: 'Tasks assigned', t: 5, by: 'Biruk', note: 'Brake pads to Dawit, Abel' });
  R.assignLabour(j, ['L4'], [T3], WS);                                                                     // a package is one task: assigned on its first line
  assert.deepEqual([j.labours[2].assigned, j.labours[3].assigned], [[{ id: 'u5', name: 'Hana' }], undefined]);

  assert.throws(() => R.clockIn(j, 'L1', T3, []), err(403, /assigned to Dawit, Abel/));                    // not his task
  assert.throws(() => R.clockIn(j, 'L4', T1, []), err(403, /assigned to Hana/));                          // the package follows its first line
  R.clockIn(j, 'L2', T3, [], 10);                                                                          // nobody assigned: open to every technician
  R.clockOut(j, 'L2', 'Lunch', T3, 11);
  R.clockIn(j, 'L1', T2, [], 12);                                                                          // the second assigned technician can start it
  assert.throws(() => R.assignLabour(j, ['L1'], [T1], WS), err(409, /Abel is clocked in/));                // cannot take it from the one who is working
  R.assignLabour(j, ['L1'], [T1, T2], WS);                                                                 // keeping him on it is fine
  R.clockOut(j, 'L1', 'Completed', T2, 20);
  assert.throws(() => R.assignLabour(j, ['L1'], [T1], WS), err(409, /completed/));
  R.clockIn(j, 'L3', WS, [], 30);                                                                          // the supervisor can clock any task
  R.clockOut(j, 'L3', 'Lunch', WS, 31);
  R.assignLabour(j, ['L3'], [], WS, 40);                                                                   // empty list = take the assignment away
  assert.equal(j.labours[2].assigned, undefined); assert.equal(j.log.at(-1).s, 'Tasks unassigned');
  R.clockIn(j, 'L3', T1, [], 50);                                                                          // open again
});

test('assign: only while the card is with the workshop and before the invoice', () => {
  const lab = [{ id: 'L1', desc: 'x', price: 1, done: false, logs: [] }];
  R.assignLabour(job({ status: 'Dispatched', labours: lab }), ['L1'], [T1], WS);
  for (const status of ['Created', 'Work done', 'Back with SA', 'Closed']) assert.throws(() => R.assignLabour(job({ status, labours: lab.map(l => ({ ...l })) }), ['L1'], [T1], WS), err(409, /with the workshop/));
  assert.throws(() => R.assignLabour(job({ status: 'At workshop', labours: lab, inv: { no: 'INV-1' } }), ['L1'], [T1], WS), err(409, /with the workshop/));
  R.assignLabour(job({ status: 'At workshop', labours: lab.map(l => ({ ...l })) }), ['L1'], [T1], { id: 'm', name: 'Boss', role: 'MGR' });   // the manager can do the supervisor's step
});

test('estimate and proforma lines keep their section (BP / ME)', () => {
  const e = R.normalizeEstimate({ labours: [{ desc: 'Brake pads', hours: 1, section: 'Mechanical Repairs' }, { desc: 'Dent', hours: 1, section: 'nonsense' }] }, 100);
  assert.deepEqual(e.labours, [{ desc: 'Brake pads', section: 'Mechanical Repairs', hours: 1, price: 100 }, { desc: 'Dent', hours: 1, price: 100 }]);
});

// ---- 12, 14. the first-hand insurance proforma ----
test('proforma: issue needs an estimator, a date and lines; only an issued proforma becomes a job card, once', () => {
  const p = { id: 'PRO-1', status: 'Draft', estimator: '', pdate: '2026-10-09', labours: [], parts: [] };
  assert.throws(() => R.checkProformaIssue(p), err(400, /estimator/));
  p.estimator = 'Almaz';
  assert.throws(() => R.checkProformaIssue(p), err(400, /Add labour or parts/));
  p.labours.push({ desc: 'x', price: 1 }); R.checkProformaIssue(p);
  assert.throws(() => R.checkProformaIssue({ ...p, pdate: '9 Oct' }), err(400, /date/));
  assert.throws(() => R.checkConvert(p), err(409, /Issue the proforma/));
  p.status = 'Issued'; R.checkConvert(p); R.checkProformaIssue(p);            // an issued proforma can still be edited and re-issued
  p.status = 'Converted'; p.job = 'TC-5';
  assert.throws(() => R.checkConvert(p), err(409, /already turned into job card TC-5/));
  assert.throws(() => R.assertProformaOpen(p), err(409, /TC-5/));
  assert.deepEqual(['2026-10-09', '2026-13-45', '9/10/2026', '', undefined].map(R.dateOk), [true, false, false, false, false]);
});

// ---- who the invoice is made out to ----
test('bill-to: the customer or an insurance company, changeable (and logged) until the invoice', () => {
  const j = job({ payer: 'Awash Insurance', policy_no: 'P-1' });
  R.setPayer(j, 'Awash Insurance', 'P-1', SA, 5); assert.equal(j.log.length, 0);                    // nothing changed
  R.setPayer(j, '', 'ignored', SA, 6);                                                              // back to the customer: the policy goes too
  assert.deepEqual([j.payer, j.policy_no, j.log[0].note], [null, null, 'Awash Insurance to Customer']);
  R.setPayer(j, ' Nyala Insurance ', ' P-9 ', SA, 7);
  assert.deepEqual([j.payer, j.policy_no, j.log[1].note, j.log[1].by], ['Nyala Insurance', 'P-9', 'Customer to Nyala Insurance', 'Almaz']);
  j.inv = { no: 'INV-1' };
  assert.throws(() => R.setPayer(j, null, '', SA), err(409, /Already invoiced \(INV-1\)/));
});
