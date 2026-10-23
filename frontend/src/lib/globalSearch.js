// One search box for the whole garage: job card number, customer name or phone, plate or VIN, part number or description.
import { vehicleName } from './format.js';
import { searchParts } from './search.js';

const fold = s => String(s ?? '').toLowerCase();
const plain = s => fold(s).replace(/[\s\-_./]+/g, '');
const digits = s => String(s ?? '').replace(/\D+/g, '');
// how well `text` fits one typed word: 100 exact, 80 starts with it, 60 a word starts with it, 40 contains it, 0 no
function fit(text, w) {
  const t = fold(text), p = plain(text), q = plain(w);
  if (!q) return 0;
  if (t === w || p === q) return 100;
  if (t.startsWith(w) || p.startsWith(q)) return 80;
  if (t.split(/[^a-z0-9\u1200-\u137f]+/).some(x => x.startsWith(w))) return 60;
  return t.includes(w) || p.includes(q) ? 40 : 0;
}
// every typed word must be found in at least one field; the score is the sum of the best fit of each word
function score(fields, words) {
  let total = 0;
  for (const w of words) { const best = Math.max(0, ...fields.map(f => fit(f, w))); if (!best) return 0; total += best; }
  return total;
}
// phone numbers are typed as 0980…, +251 980… or 980…: compare the last 9 digits
function phoneFit(phone, q) {
  const qd = digits(q); if (qd.length < 3) return 0;
  const pd = digits(phone), tail = pd.slice(-9), qt = qd.replace(/^(251|0)/, '');
  return pd.includes(qd) || (qt.length >= 3 && tail.includes(qt)) ? (tail.endsWith(qt) ? 70 : 45) : 0;
}

export function searchEverything({ db, text, me, limit = 5 }) {
  const q = String(text || '').trim(), words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const tech = me?.role === 'TECH', cust = id => db.c.find(x => x.id === id) || {}, veh = id => db.v.find(x => x.id === id) || {};
  const top = (arr, n = limit) => arr.sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
  const groups = [];

  const jobs = [];
  for (const j of db.j) {
    const c = cust(j.cid), v = veh(j.vid);
    const s = score([j.id, c.name, v.plate, v.vin, j.claim_no, j.note], words);
    if (s) jobs.push([s + (fold(j.id) === fold(q) ? 50 : 0), { type: 'job', id: j.id, title: j.id, sub: [c.name, v.plate, vehicleName(v)].filter(Boolean).join(' · '), status: j.status }]);
  }
  if (jobs.length) groups.push({ key: 'job', label: 'Job cards', items: top(jobs) });

  const custs = [];
  for (const c of db.c) {
    const s = Math.max(score([c.name, c.id], words), words.length === 1 ? phoneFit(c.phone, words[0]) : 0);
    if (s) custs.push([s, { type: 'customer', id: c.id, title: c.name, sub: [c.phone, c.id].filter(Boolean).join(' · ') }]);
  }
  if (custs.length) groups.push({ key: 'customer', label: 'Customers', items: top(custs) });

  const cars = [];
  for (const v of db.v) {
    const s = score([v.plate, v.vin, v.engine, vehicleName(v)], words);
    if (s) cars.push([s, { type: 'vehicle', id: v.id, cid: v.cid, title: v.plate || vehicleName(v) || 'Vehicle', sub: [vehicleName(v), cust(v.cid).name].filter(Boolean).join(' · ') }]);
  }
  if (cars.length) groups.push({ key: 'vehicle', label: 'Vehicles', items: top(cars) });

  if (!tech && db.p?.length) {
    const parts = searchParts(db.p, q, limit).map(p => ({ type: 'part', id: p.id, title: p.code, sub: `${p.name} · ${p.stock} in stock`, low: p.stock <= p.reorder }));
    if (parts.length) groups.push({ key: 'part', label: 'Parts', items: parts });
  }
  return groups;
}

// "pos", "parts" or "reports" jump to that screen: `pages` is [[key, label], ...] from the menu the person can see
export function matchPages(pages, text, limit = 3) {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return pages.filter(([k, label]) => score([label, k], words) > 0).slice(0, limit).map(([k, label]) => ({ type: 'page', id: k, title: label, sub: 'Open this screen' }));
}
