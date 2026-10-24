// Job card business rules. Pure functions (no database, no clock unless passed in) so they can be unit-tested: node --test
// Each function changes the job object it is given and throws fail(status, message) when the rule is broken.
import { fail } from './errors.js';
import { totals } from './lib.js';

export const SECTIONS = ['Regular Service', 'Mechanical Repairs', 'Body & Paints'];
export const STATUSES = ['Created', 'Dispatched', 'At workshop', 'Work done', 'Back with SA', 'Closed', 'Invoiced', 'Delivered'];
export const BEFORE_CLOSE = ['Created', 'Dispatched', 'At workshop', 'Work done', 'Back with SA'];
export const REASONS = ['Completed', 'Lunch', 'End of work day', 'Supervisor command'];
export const INVOICE_PREFIX = { Proforma: 'PF', Cash: 'CI', Credit: 'CR' };
// target status -> [status it must come from, roles that may do it]
export const FLOW = {
  Dispatched: ['Created', ['SA']], 'At workshop': ['Dispatched', ['WS']], 'Work done': ['At workshop', ['WS']],
  'Back with SA': ['Work done', ['SA']], Closed: ['Back with SA', ['SA']], Delivered: ['Invoiced', ['SA']]
};

export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const qn = v => Math.round(+v * 100) / 100;
export const activeClock = l => (l.logs || []).find(x => !x.out);
// Labour rate (ETB per hour). `rate` is one number for every section, or { default, 'Regular Service': 300, 'Body & Paints': 450, ... }.
// The price book's model group says the make: Suzuki, Toyota (SEDAN / SUV ...) or Others. Each make has its own hourly rate; a line with no model group
// uses the rate of its section, then the standard rate.
export const MAKES = ['Suzuki', 'Toyota', 'Others'];
export const DEFAULT_MAKE_RATES = { Suzuki: 350, Toyota: 400, Others: 450 };
export const makeOf = g => { const s = String(g ?? '').trim().toLowerCase(); return !s ? '' : s.includes('toyota') ? 'Toyota' : s.includes('suzuki') ? 'Suzuki' : 'Others'; };
export const rateOf = (rate, section, model) => {
  if (rate && typeof rate === 'object') { const m = makeOf(model), r = Number((m ? rate[m] : undefined) ?? rate[section] ?? rate.default); return r >= 0 ? r : 0; }
  return Number(rate) >= 0 ? Number(rate) : 0;
};
export const isAdminOr = (u, ...roles) => ['ADMIN', 'MGR', ...roles].includes(u.role);   // the Manager can take any step the Administrator can
const findLabour = (j, id) => j.labours.find(l => l.id === id) || fail(404, 'Labour not found');
// The labour lines of one service package (Type A / B / C) share `svc` and are clocked together, on the first of them. Every other task is clocked on its own line.
const clockLead = (j, l) => (l.svc ? j.labours.find(x => x.svc === l.svc) || l : l);

// The Service Advisor can add or remove labour while the vehicle is NOT in the workshop (before it goes, when it is sent back, or once it is back
// with the advisor / closed), and only until the invoice is issued.
export const LABOUR_OPEN = ['Created', 'Dispatched', 'Back with SA', 'Closed'];
export const assertLabourOpen = (j, what = 'changed') => {
  if (j.inv) fail(409, `Already invoiced (${j.inv.no}): labour can no longer be ${what}`);
  if (!LABOUR_OPEN.includes(j.status)) fail(409, `Labour cannot be ${what} while the vehicle is in the workshop. Wait for it, or ask the workshop to send it back.`);
};

export function addLabour(j, b, rate, now = Date.now(), rnd = Math.random) {
  assertLabourOpen(j, 'added');
  if (!str(b.desc)) fail(400, 'Describe the work');
  const section = SECTIONS.includes(b.section) ? b.section : SECTIONS[0];
  const price = Math.max(0, +b.price || qn((+b.hours || 0) * rateOf(rate, section)));   // a typed price wins, otherwise hours x the section's labour rate
  // A task added after the workshop has already finished once (card with the advisor, closed, or sent back) is an ADDITIONAL task: it is not done,
  // so the card goes back to the workshop, a technician clocks in and out on it and completes it. Only a line the advisor marks "billing only"
  // (a fee that needs no work) is created already done, and is never clocked.
  const after = ['Back with SA', 'Closed'].includes(j.status), billing = after && (b.billing === true || b.billing === 'true');
  const extra = !billing && (j.log || []).some(x => x.s === 'Work done');
  j.labours.push({ id: 'L' + now.toString(36) + rnd().toString(36).slice(2, 5), desc: str(b.desc), section, price, done: billing, ...(billing && { late: true }), ...(extra && { extra: true }), logs: [] });
}

export function removeLabour(j, lid) {
  assertLabourOpen(j, 'removed');
  const l = j.labours.find(x => x.id === lid);
  if (l && (l.logs || []).length) fail(409, 'This work has been clocked and cannot be removed');
  j.labours = j.labours.filter(x => x.id !== lid);
}

// Parts can be issued and removed until the invoice, also on a closed card (the Service Advisor corrects it before invoicing)
export function assertPartsOpen(j) { if (j.inv || !(BEFORE_CLOSE.includes(j.status) || j.status === 'Closed')) fail(409, 'Job card is closed'); }
export const partQty = v => Math.max(0.01, qn(v) || 1);

// A part typed in by hand (not from the stock list): not tracked in stock
export function addFreePart(j, b) {
  assertPartsOpen(j);
  if (!str(b.name)) fail(400, 'Part name is required');
  j.parts.push({ name: str(b.name), qty: partQty(b.qty), price: Math.max(0, +b.price || 0) });
}

// A part taken from stock. `part` is the inventory row; the caller takes the quantity out of stock.
// `price` (optional) is the selling price typed by the Service Advisor; without it the catalogue price is used. The catalogue price is kept as `list` when they differ.
export function addStockPart(j, part, qty, price) {
  const list = +part.price, typed = price !== undefined && price !== null && price !== '';
  const sell = typed ? Math.max(0, qn(price) || 0) : list;
  j.parts.push({ pid: part.id, code: part.code, name: part.name, qty, price: sell, ...(sell !== list && { list }) });
}

// A part that is short when an estimate, proforma or service package is loaded does not stop the whole load: the line is added as
// "waiting for stock" (nothing leaves stock yet). The Service Advisor receives it once the stock has arrived; the card cannot close before.
export const waitingParts = j => j.parts.filter(p => p.waiting);
export function addWaitingPart(j, part, qty, price) {
  const list = +part.price, typed = price !== undefined && price !== null && price !== '';
  const sell = typed ? Math.max(0, qn(price) || 0) : list;
  j.parts.push({ pid: part.id, code: part.code, name: part.name, qty, price: sell, waiting: true, ...(sell !== list && { list }) });
}
export function waitingLine(j, index) {
  assertPartsOpen(j);
  const i = Number(index), p = Number.isInteger(i) && j.parts[i];
  if (!p) fail(404, 'Part line not found');
  if (!p.waiting) fail(409, 'This part is not waiting for stock');
  return p;
}

export function removePartLine(j, index) {
  assertPartsOpen(j);
  const i = Number(index);
  if (!Number.isInteger(i) || !j.parts[i]) fail(404, 'Part line not found');
  return j.parts.splice(i, 1)[0];
}

export function transition(j, to, u, now = Date.now()) {
  const f = FLOW[to];
  if (!f || j.status !== f[0]) fail(409, `Job card is "${j.status}", cannot move to "${to}"`);
  if (!isAdminOr(u, ...f[1])) fail(403, 'Your role cannot do this step');
  if (to === 'Dispatched' && !j.labours.length) fail(400, 'Add at least one labour first');
  if (to === 'Work done' && j.labours.some(l => !l.done)) fail(400, 'Every labour must be completed first');
  if (to === 'Closed' && j.labours.some(l => !l.done)) fail(409, 'Some tasks are not done yet. Send the card back to the workshop so a technician can clock in and complete them, or remove them.');
  if (to === 'Closed' && pendingRequests(j).length) fail(409, 'Issue or reject the pending part requests first');
  if (to === 'Closed' && waitingParts(j).length) fail(409, 'Some parts are still waiting for stock. Receive them when they arrive, or remove them.');
  if (to === 'Closed' && pendingPrices(j).length) fail(409, "A price change is waiting for the manager's approval");
  j.status = to; j.log.push({ s: to, t: now, by: u.name });
}

// The Service Advisor sends a card back to the workshop (more tasks, more parts) from "Received by SA" or "Closed", before the invoice.
// It goes to "Dispatched" again: the workshop receives it, clocks the new tasks and sends it back.
export function returnToWorkshop(j, u, now = Date.now()) {
  if (j.inv) fail(409, `Already invoiced (${j.inv.no}): it cannot go back to the workshop`);
  if (!['Back with SA', 'Closed'].includes(j.status)) fail(409, `Job card is "${j.status}": only a card with the Service Advisor can go back to the workshop`);
  if (!isAdminOr(u, 'SA')) fail(403, 'Your role cannot do this step');
  const todo = j.labours.filter(l => !l.done).length;
  j.status = 'Dispatched'; j.log.push({ s: 'Returned to workshop', t: now, by: u.name, ...(todo && { note: `${todo} additional task${todo === 1 ? '' : 's'} to clock` }) });
}

// ---- the workshop supervisor assigns tasks to technicians ----
// A task (or a whole Type A/B/C package, which is one task) can be given to one or more technicians while the card is with the workshop. Only they can clock in on it
// (the supervisor can still clock anyone); a task nobody is assigned to stays open to every technician. An empty `techs` list takes the assignment away.
export const ASSIGN_STATUSES = ['Dispatched', 'At workshop'];
export function assignLabour(j, lids, techs, u, now = Date.now()) {
  if (!isAdminOr(u, 'WS')) fail(403, 'Only the workshop supervisor can assign tasks');
  if (j.inv || !ASSIGN_STATUSES.includes(j.status)) fail(409, 'Tasks can be assigned while the card is with the workshop');
  const leads = [...new Set((lids || []).map(id => clockLead(j, findLabour(j, id))))];
  if (!leads.length) fail(400, 'Choose at least one task to assign');
  const team = [...new Map((techs || []).map(t => [t.id, { id: t.id, name: t.name }])).values()];
  for (const l of leads) {
    if (l.done) fail(409, `${l.desc} is completed and cannot be assigned`);
    const a = activeClock(l);
    if (a && !team.some(t => t.name === a.tech)) fail(409, `${a.tech} is clocked in on ${l.desc}. Clock out first, or keep ${a.tech} on the task.`);
  }
  for (const l of leads) { if (team.length) l.assigned = team; else delete l.assigned; }
  const what = leads.map(l => l.desc).join(', ');
  j.log.push({ s: team.length ? 'Tasks assigned' : 'Tasks unassigned', t: now, by: u.name, note: str(`${what}${team.length ? ` to ${team.map(t => t.name).join(', ')}` : ''}`, 300) });
}

// `others` = the other job cards that are in the workshop (id + labours), so one person never has two clocks running
export function clockIn(j, lid, u, others = [], now = Date.now()) {
  if (j.status !== 'At workshop') fail(409, 'Job card is not in the workshop');
  const l = clockLead(j, findLabour(j, lid));
  if (l.done) fail(409, 'This labour is completed and cannot be clocked in again');
  if (u.role === 'TECH' && (l.assigned || []).length && !l.assigned.some(a => a.id === u.id || a.name === u.name)) fail(403, `This task is assigned to ${l.assigned.map(a => a.name).join(', ')}`);
  if (activeClock(l)) fail(409, 'Someone is already clocked in on this labour');
  for (const o of [j, ...others.filter(o => o.id !== j.id)])
    for (const x of o.labours) { const a = activeClock(x); if (a && a.tech === u.name) fail(409, `You are still clocked in on ${o.id} (${x.desc}). Clock out there first.`); }
  l.logs = l.logs || [];
  l.logs.push({ tech: u.name, in: now });
}

export function clockOut(j, lid, reason, u, now = Date.now()) {
  const l = clockLead(j, findLabour(j, lid)), a = activeClock(l);
  if (!REASONS.includes(reason)) fail(400, 'Choose a clock-out reason');
  if (!a) fail(409, 'Nobody is clocked in on this labour');
  if (reason === 'Supervisor command' && !isAdminOr(u, 'WS')) fail(403, 'Only the supervisor can do this');
  if (u.role === 'TECH' && a.tech !== u.name) fail(403, 'This clock belongs to another technician');
  a.out = now; a.reason = reason;
  if (reason === 'Completed') for (const x of j.labours) if (x === l || (l.svc && x.svc === l.svc)) x.done = true;
}

// Cash and credit invoices are issued once and move the card to Invoiced; a proforma is a quote and can be printed again and again.
// The amounts are frozen on the document, so a later VAT change never alters an issued invoice or old reports.
export function checkInvoice(j, type) {
  if (!INVOICE_PREFIX[type]) fail(400, 'Choose Proforma, Cash or Credit');
  if (!['Closed', 'Invoiced'].includes(j.status)) fail(409, 'Close the job card before invoicing');
  if (type !== 'Proforma' && j.inv) fail(409, `Already invoiced (${j.inv.no})`);
  if (type !== 'Proforma' && j.labours.some(l => !l.done)) fail(409, 'Some tasks are not done yet. Send the card back to the workshop so a technician can complete them first.');
  if (type !== 'Proforma' && waitingParts(j).length) fail(409, 'Some parts are still waiting for stock. Receive them when they arrive, or remove them.');
  if (type !== 'Proforma' && pendingPrices(j).length) fail(409, "A price change is waiting for the manager's approval");
}
export function issueInvoice(j, type, vat, no, u, now = Date.now()) {
  checkInvoice(j, type);
  const doc = { type, no, date: now, totals: totals(j, vat) };
  if (type === 'Proforma') { j.log.push({ s: 'Proforma printed', t: now, by: u.name, doc }); return doc; }
  j.inv = doc; j.status = 'Invoiced'; j.log.push({ s: 'Invoiced', t: now, by: u.name, doc });
  return doc;
}

// ---- selling prices: the Service Advisor can change a labour or part price until the invoice is issued ----
export function assertPriceOpen(j) { if (j.inv) fail(409, `Already invoiced (${j.inv.no}): prices can no longer be changed`); }
function price0(v) {
  if (v === '' || v === null || v === undefined) fail(400, 'Enter a price');
  const n = qn(v);
  if (!(n >= 0)) fail(400, 'Enter a price of zero or more');
  return n;
}
const priceNote = (j, what, from, to, u, now) => j.log.push({ s: 'Price changed', t: now, by: u.name, note: `${what}: ${from} to ${to}` });

export function setPartPrice(j, index, price, u, now = Date.now()) {
  assertPriceOpen(j);
  const i = Number(index), p = Number.isInteger(i) && j.parts[i];
  if (!p) fail(404, 'Part line not found');
  const to = price0(price);
  if (p.price === to) return;
  if (p.pid && p.list === undefined) p.list = p.price;          // remember the catalogue price
  priceNote(j, p.name, p.price, to, u, now); p.price = to;
}

export function setLabourPrice(j, lid, price, u, now = Date.now()) {
  assertPriceOpen(j);
  const l = findLabour(j, lid), to = price0(price);
  if (l.price === to) return;
  if (l.list === undefined) l.list = l.price;                    // remember the price the line started with
  priceNote(j, l.desc, l.price, to, u, now); l.price = to;
}

// A price may move from its list price by `limitPct` percent on the Service Advisor's own say-so; further than that the manager must approve.
// (limitPct 0 or a line with no list price = no limit.) The manager and the administrator are never limited.
export const pendingPrices = j => (j.price_reqs || []).filter(r => r.status === 'Requested');
export const priceNeedsApproval = (base, to, limitPct) => limitPct > 0 && base > 0 && Math.abs(to - base) / base * 100 > limitPct + 1e-9;

function queuePrice(j, kind, key, line, to, u, base, now, rnd) {
  j.price_reqs = (j.price_reqs || []).filter(r => !(r.status === 'Requested' && r.kind === kind && r.key === key));   // a newer ask replaces the older one
  j.price_reqs.push({ id: 'Q' + now.toString(36) + rnd().toString(36).slice(2, 5), kind, key, name: line.name || line.desc, from: line.price, to, base, by: u.name, t: now, status: 'Requested' });
  j.log.push({ s: 'Price change needs approval', t: now, by: u.name, note: `${line.name || line.desc}: ${line.price} to ${to}` });
}
// Returns 'applied', 'unchanged' or 'pending' (waiting for the manager)
export function submitPartPrice(j, index, price, u, limitPct = 0, now = Date.now(), rnd = Math.random) {
  assertPriceOpen(j);
  const i = Number(index), p = Number.isInteger(i) && j.parts[i];
  if (!p) fail(404, 'Part line not found');
  const to = price0(price);
  if (p.price === to) return 'unchanged';
  const base = p.list !== undefined ? +p.list : +p.price;
  if (isAdminOr(u) || !priceNeedsApproval(base, to, limitPct)) { setPartPrice(j, index, to, u, now); return 'applied'; }
  queuePrice(j, 'part', `${i}:${p.name}`, p, to, u, base, now, rnd);
  return 'pending';
}
export function submitLabourPrice(j, lid, price, u, limitPct = 0, now = Date.now(), rnd = Math.random) {
  assertPriceOpen(j);
  const l = findLabour(j, lid), to = price0(price);
  if (l.price === to) return 'unchanged';
  const base = l.list !== undefined ? +l.list : +l.price;
  if (isAdminOr(u) || !priceNeedsApproval(base, to, limitPct)) { setLabourPrice(j, lid, to, u, now); return 'applied'; }
  queuePrice(j, 'labour', l.id, l, to, u, base, now, rnd);
  return 'pending';
}
export function decidePrice(j, rid, approve, u, now = Date.now()) {
  if (!isAdminOr(u)) fail(403, 'Only the manager can approve a price change');
  const r = (j.price_reqs || []).find(x => x.id === rid) || fail(404, 'Price request not found');
  if (r.status !== 'Requested') fail(409, `This request was already ${r.status.toLowerCase()}`);
  if (approve) {
    if (r.kind === 'part') {
      const i = Number(String(r.key).split(':')[0]);
      if (!j.parts[i] || j.parts[i].name !== r.name) fail(409, 'The part line has changed since the request. Ask again.');
      setPartPrice(j, i, r.to, u, now);
    } else setLabourPrice(j, r.key, r.to, u, now);
  } else j.log.push({ s: 'Price change rejected', t: now, by: u.name, note: `${r.name}: ${r.from} to ${r.to}` });
  r.status = approve ? 'Approved' : 'Rejected'; r.by2 = u.name; r.t2 = now;
}

// ---- mileage on the job card ----
// `km` is the odometer reading typed in; `last` is the vehicle's last recorded reading (or null). The odometer cannot go backwards.
export function cleanKm(v) {
  const n = Math.round(Number(v));
  return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n <= 2_000_000 ? n : null;
}
export function checkMileage(km, last) {
  if (km === null) fail(400, 'Enter the vehicle mileage in km');
  if (last !== null && last !== undefined && km < last) fail(400, `Mileage cannot be lower than the last recorded ${last} km`);
  return km;
}

// The odometer reading when the vehicle leaves the workshop (optional on closing; never below the arrival reading). Empty keeps the arrival reading.
export function setMileageOut(j, v) {
  if (v === undefined || v === null || v === '') return;
  j.mileage_out = checkMileage(cleanKm(v), j.mileage);
}
export const completionKm = j => (j.mileage_out ?? j.mileage ?? null);

// ---- the details the Service Advisor may add on the card (claim number, expected finish date, priority) ----
export const PRIORITIES = ['Normal', 'Urgent'];
export function setDetails(j, b, u, now = Date.now()) {
  if (j.inv) fail(409, `Already invoiced (${j.inv.no}): the details can no longer be changed`);
  const claim = str(b.claim_no, 60) || null, due = dateOk(b.due_date) ? b.due_date : null, prio = PRIORITIES.includes(b.priority) && b.priority !== 'Normal' ? b.priority : null;
  if (b.due_date && !due) fail(400, 'Enter the date as year-month-day');
  if ((j.claim_no || null) === claim && (j.due_date || null) === due && (j.priority || null) === prio) return;
  Object.assign(j, { claim_no: claim, due_date: due, priority: prio });
  j.log.push({ s: 'Details changed', t: now, by: u.name, note: [claim && `claim ${claim}`, due && `due ${due}`, prio].filter(Boolean).join(', ') || 'cleared' });
}

// ---- service packages on the job card ----
export function assertServiceOpen(j, code) {
  if (!['Created', 'Dispatched'].includes(j.status)) fail(409, 'A service can only be added before the vehicle is received in the workshop');
  if ((j.services || []).includes(code)) fail(409, `Service ${code} is already on this job card`);
}

// ---- additional parts: a mechanic REQUESTS, the Service Advisor ISSUES ----
export const pendingRequests = j => (j.requests || []).filter(r => r.status === 'Requested');

export function requestPart(j, ref, qty, u, now = Date.now(), rnd = Math.random) {
  if (j.status !== 'At workshop') fail(409, 'Parts can only be requested while the job card is in the workshop');
  if (!str(ref.name)) fail(400, 'Say which part you need');
  j.requests = j.requests || [];
  j.requests.push({ id: 'R' + now.toString(36) + rnd().toString(36).slice(2, 5), pid: ref.pid, code: ref.code, name: str(ref.name, 120), qty: partQty(qty), by: u.name, t: now, status: 'Requested' });
}
export function openRequest(j, rid) {
  const r = (j.requests || []).find(x => x.id === rid) || fail(404, 'Part request not found');
  if (r.status !== 'Requested') fail(409, `This request was already ${r.status.toLowerCase()}`);
  return r;
}
export function settleRequest(j, r, status, u, now = Date.now()) { r.status = status; r.by2 = u.name; r.t2 = now; }

// ---- estimates (body & paint) ----
export const EST_SECTION = 'Body & Paints';

// Clean the lines the screen sends. `catalogue` is a Map of stock parts by id: a part picked from the stock list takes its name and code
// from there, and its price too unless a selling price was typed. Hours x labour rate fills a labour price that was left empty.
export function normalizeEstimate(b, rate, catalogue = new Map()) {
  const list = v => (Array.isArray(v) ? v.slice(0, 100) : []);
  const labours = list(b.labours).map(l => {
    const hours = Math.max(0, qn(l.hours) || 0), typed = Math.max(0, qn(l.price) || 0);
    return { desc: str(l.desc), ...(SECTIONS.includes(l.section) && { section: l.section }), hours, price: typed || qn(hours * rateOf(rate, l.section)) };
  }).filter(l => l.desc);
  const parts = list(b.parts).map(p => {
    const cat = p.pid ? catalogue.get(p.pid) : null, blank = p.price === '' || p.price === null || p.price === undefined;
    return { ...(cat && { pid: cat.id, code: cat.code }), name: cat ? cat.name : str(p.name, 120), qty: partQty(p.qty), price: blank ? (cat ? +cat.price : 0) : Math.max(0, qn(p.price) || 0) };
  }).filter(p => p.name);
  return { note: str(b.note, 500), labours, parts };
}
export function assertDraft(e) { if (e.status !== 'Draft') fail(409, `${e.id} is finalized. Move it back to draft to change it.`); }
export function checkFinalize(e) {
  assertDraft(e);
  if (!e.labours.length && !e.parts.length) fail(400, 'Add labour or parts before finalizing');
}
export function checkReopen(e) {
  if (e.status !== 'Finalized') fail(409, `${e.id} is already a draft`);
  if (e.used_in) fail(409, `${e.id} is already loaded on ${e.used_in}`);
}
// Loading an estimate on a job card (the number typed or picked): the card must still be open for labour, the estimate final, unused and for this vehicle.
export function checkEstimateImport(j, e) {
  if (!e) fail(404, 'Estimate number not found');
  if (j.inv || !LABOUR_OPEN.includes(j.status)) fail(409, 'An estimate can only be loaded while the vehicle is not in the workshop, and before the invoice');
  if (e.status !== 'Finalized') fail(409, `${e.id} is still a draft. Finalize it first.`);
  if (e.used_in) fail(409, `${e.id} is already loaded on ${e.used_in}`);
  if (e.vid && e.vid !== j.vid) fail(409, `${e.id} was made for a different vehicle`);   // an estimate made before the customer was registered has no vehicle yet: it takes this card's
}

// ---- first-hand (insurance) proforma: made before any job card; creating the job card turns it into a finalized estimate ----
export const dateOk = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(Date.parse(v));
export function assertProformaOpen(p) { if (p.status === 'Converted') fail(409, `${p.id} was already turned into job card ${p.job}`); }
export function checkProformaIssue(p) {
  assertProformaOpen(p);
  if (!p.estimator) fail(400, 'Choose the estimator');
  if (!dateOk(p.pdate)) fail(400, 'Enter the proforma date');
  if (!p.labours.length && !p.parts.length) fail(400, 'Add labour or parts first');
}
export function checkConvert(p) {
  assertProformaOpen(p);
  if (p.status !== 'Issued') fail(409, 'Issue the proforma (and print it) before creating the job card');
}

// ---- who the invoice is made out to: the customer (payer null) or an insurance company; changeable until the invoice is issued ----
export function setPayer(j, payer, policy, u, now = Date.now()) {
  if (j.inv) fail(409, `Already invoiced (${j.inv.no}): who it is made out to can no longer be changed`);
  const to = str(payer, 160) || null, pol = to ? str(policy, 60) || null : null;
  if ((j.payer || null) === to && (j.policy_no || null) === pol) return;
  j.log.push({ s: 'Bill-to changed', t: now, by: u.name, note: `${j.payer || 'Customer'} to ${to || 'Customer'}` });
  j.payer = to; j.policy_no = pol;
}
