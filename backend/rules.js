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
export const isAdminOr = (u, ...roles) => ['ADMIN', ...roles].includes(u.role);
const findLabour = (j, id) => j.labours.find(l => l.id === id) || fail(404, 'Labour not found');

export function addLabour(j, b, rate, now = Date.now(), rnd = Math.random) {
  if (j.status !== 'Created') fail(409, 'Labour can only be added before dispatch');
  if (!str(b.desc)) fail(400, 'Describe the work');
  const price = Math.max(0, +b.price || qn((+b.hours || 0) * rate));   // a typed price wins, otherwise hours x labour rate
  j.labours.push({ id: 'L' + now.toString(36) + rnd().toString(36).slice(2, 5), desc: str(b.desc), section: SECTIONS.includes(b.section) ? b.section : SECTIONS[0], price, done: false, logs: [] });
}

export function removeLabour(j, lid) {
  if (j.status !== 'Created') fail(409, 'Labour can only be removed before dispatch');
  j.labours = j.labours.filter(l => l.id !== lid);
}

export function assertPartsOpen(j) { if (!BEFORE_CLOSE.includes(j.status)) fail(409, 'Job card is closed'); }
export const partQty = v => Math.max(0.01, qn(v) || 1);

// A part typed in by hand (not from the stock list): not tracked in stock
export function addFreePart(j, b) {
  assertPartsOpen(j);
  if (!str(b.name)) fail(400, 'Part name is required');
  j.parts.push({ name: str(b.name), qty: partQty(b.qty), price: Math.max(0, +b.price || 0) });
}

// A part taken from stock. `part` is the inventory row; the caller takes the quantity out of stock.
export function addStockPart(j, part, qty) { j.parts.push({ pid: part.id, code: part.code, name: part.name, qty, price: +part.price }); }

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
  j.status = to; j.log.push({ s: to, t: now, by: u.name });
}

// `others` = the other job cards that are in the workshop (id + labours), so one person never has two clocks running
export function clockIn(j, lid, u, others = [], now = Date.now()) {
  if (j.status !== 'At workshop') fail(409, 'Job card is not in the workshop');
  const l = findLabour(j, lid);
  if (l.done) fail(409, 'This labour is completed and cannot be clocked in again');
  if (activeClock(l)) fail(409, 'Someone is already clocked in on this labour');
  for (const o of [j, ...others.filter(o => o.id !== j.id)])
    for (const x of o.labours) { const a = activeClock(x); if (a && a.tech === u.name) fail(409, `You are still clocked in on ${o.id} (${x.desc}). Clock out there first.`); }
  l.logs = l.logs || [];
  l.logs.push({ tech: u.name, in: now });
}

export function clockOut(j, lid, reason, u, now = Date.now()) {
  const l = findLabour(j, lid), a = activeClock(l);
  if (!REASONS.includes(reason)) fail(400, 'Choose a clock-out reason');
  if (!a) fail(409, 'Nobody is clocked in on this labour');
  if (reason === 'Supervisor command' && !isAdminOr(u, 'WS')) fail(403, 'Only the supervisor can do this');
  if (u.role === 'TECH' && a.tech !== u.name) fail(403, 'This clock belongs to another technician');
  a.out = now; a.reason = reason;
  if (reason === 'Completed') l.done = true;
}

// Cash and credit invoices are issued once and move the card to Invoiced; a proforma is a quote and can be printed again and again.
// The amounts are frozen on the document, so a later VAT change never alters an issued invoice or old reports.
export function checkInvoice(j, type) {
  if (!INVOICE_PREFIX[type]) fail(400, 'Choose Proforma, Cash or Credit');
  if (!['Closed', 'Invoiced'].includes(j.status)) fail(409, 'Close the job card before invoicing');
  if (type !== 'Proforma' && j.inv) fail(409, `Already invoiced (${j.inv.no})`);
}
export function issueInvoice(j, type, vat, no, u, now = Date.now()) {
  checkInvoice(j, type);
  const doc = { type, no, date: now, totals: totals(j, vat) };
  if (type === 'Proforma') { j.log.push({ s: 'Proforma printed', t: now, by: u.name, doc }); return doc; }
  j.inv = doc; j.status = 'Invoiced'; j.log.push({ s: 'Invoiced', t: now, by: u.name, doc });
  return doc;
}
