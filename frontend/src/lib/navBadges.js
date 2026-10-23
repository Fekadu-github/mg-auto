// The small numbers on the menu: how many things are waiting for the person, per screen. Zero shows nothing.
import { isMgr, isSA, isTech } from './constants.js';
import { lowParts } from './stock.js';
import { serviceDue } from './insight.js';
export function navBadges(db, me) {
  const n = s => db.j.filter(j => s.includes(j.status)).length, out = {};
  const shop = n(['Dispatched', 'At workshop']);
  const jobs = (isSA(me) ? n(['Work done', 'Back with SA']) : 0) + (isMgr(me) ? db.j.filter(j => (j.price_reqs || []).some(r => r.status === 'Requested')).length : 0);
  const inv = isTech(me) ? 0 : lowParts(db.p).length;
  const due = isSA(me) ? serviceDue(db).length : 0;
  if (due) out.due = due;
  if (shop) out.shop = shop;
  if (jobs) out.jobs = jobs;
  if (inv) out.inv = inv;
  return out;
}
