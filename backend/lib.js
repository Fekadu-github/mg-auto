// Pure helpers (no I/O) so they can be unit-tested: node --test
export const EAT = 3 * 3600e3, DAY = 86400e3;               // Addis Ababa is UTC+3, no daylight saving
export const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const dayKey = ms => new Date(ms + EAT).toISOString().slice(0, 10);
const dayStart = k => Date.parse(k + 'T00:00:00Z') - EAT;
const bad = m => Object.assign(new Error(m), { code: 400 });

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (Addis Ababa days, both included) -> [startMs, endMsExclusive]
export function range(qs) {
  const re = /^\d{4}-\d{2}-\d{2}$/, f = String(qs.from || ''), t = String(qs.to || qs.from || '');
  if (!re.test(f) || !re.test(t) || isNaN(Date.parse(f)) || isNaN(Date.parse(t))) throw bad('Choose a from and to date');
  const a = dayStart(f), b = dayStart(t) + DAY;
  if (b <= a) throw bad('The "to" date is before the "from" date');
  if (b - a > 366 * DAY) throw bad('Choose a range of up to one year');
  return [a, b];
}

// Money for a job card at a given VAT rate (rate is a fraction, e.g. 0.15)
export function totals(j, rate) {
  const labour = r2(j.labours.reduce((s, x) => s + x.price, 0)), parts = r2(j.parts.reduce((s, x) => s + x.qty * x.price, 0));
  const sub = r2(labour + parts), vat = r2(sub * rate);
  return { labour, parts, sub, vat, total: r2(sub + vat), rate };
}

// Ethiopian-friendly phone normaliser -> +2519XXXXXXXX, or null when it cannot be a mobile number
export function e164(p, cc = '251') {
  let s = String(p || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (s.startsWith(cc) && s.length === cc.length + 9) return '+' + s;
  if (s.startsWith('0') && s.length === 10) return '+' + cc + s.slice(1);
  if (/^[79]\d{8}$/.test(s)) return '+' + cc + s;
  return null;
}

// Daily revenue: a cash or credit invoice counts on the day it was issued. Proformas are quotes and never count.
export function revenueReport(jobs, a, b, rate, cname = {}, plate = {}) {
  const invoices = [], days = new Map();
  for (const j of jobs) {
    const d = j.inv;
    if (!d || !['Cash', 'Credit'].includes(d.type) || d.date < a || d.date >= b) continue;
    const t = d.totals || totals(j, rate);
    invoices.push({ date: d.date, no: d.no, jc: j.id, customer: cname[j.cid] || '', plate: plate[j.vid] || '', type: d.type, ...t });
    const k = dayKey(d.date), r = days.get(k) || { day: k, count: 0, cash: 0, credit: 0, labour: 0, parts: 0, vat: 0, total: 0 };
    r.count++; r[d.type === 'Cash' ? 'cash' : 'credit'] += t.total;
    r.labour += t.labour; r.parts += t.parts; r.vat += t.vat; r.total += t.total; days.set(k, r);
  }
  const rows = [...days.values()].sort((x, y) => x.day < y.day ? -1 : 1).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v == 'number' ? r2(v) : v])));
  const sum = rows.reduce((s, r) => ({ count: s.count + r.count, cash: r2(s.cash + r.cash), credit: r2(s.credit + r.credit), labour: r2(s.labour + r.labour), parts: r2(s.parts + r.parts), vat: r2(s.vat + r.vat), total: r2(s.total + r.total) }),
    { count: 0, cash: 0, credit: 0, labour: 0, parts: 0, vat: 0, total: 0 });
  return { days: rows, invoices: invoices.sort((x, y) => x.date - y.date), sum };
}

// Technician hours: time between clock-in and clock-out, clipped to the range and split at Addis Ababa midnight.
// A clock that is still running counts up to `now` and the technician is flagged `open`.
export function hoursReport(jobs, a, b, now = Date.now(), only = null) {
  const T = new Map(), D = new Map(), S = new Map();
  const tech = n => T.get(n) || (T.set(n, { tech: n, ms: 0, jobs: new Set(), labours: new Set(), completed: 0, open: false }), T.get(n));
  for (const j of jobs) for (const l of j.labours || []) for (const x of l.logs || []) {
    if (only && x.tech !== only) continue;
    if (x.reason === 'Completed' && x.out >= a && x.out < b) tech(x.tech).completed++;
    const s = Math.max(x.in, a), e = Math.min(x.out || now, b);
    if (e <= s) continue;
    const t = tech(x.tech); t.ms += e - s; t.jobs.add(j.id); t.labours.add(j.id + '/' + l.id); if (!x.out) t.open = true;
    const sec = l.section || 'Other'; S.set(sec, (S.get(sec) || 0) + e - s);
    for (let c = s; c < e;) {
      const k = dayKey(c), nx = Math.min(e, dayStart(k) + DAY), key = k + '\u0000' + x.tech;
      D.set(key, (D.get(key) || 0) + nx - c); c = nx;
    }
  }
  const h = ms => r2(ms / 36e5);
  const byTech = [...T.values()].map(t => ({ tech: t.tech, hours: h(t.ms), jobs: t.jobs.size, labours: t.labours.size, completed: t.completed, open: t.open })).sort((x, y) => y.hours - x.hours);
  const byDay = [...D].map(([k, ms]) => { const [day, tc] = k.split('\u0000'); return { day, tech: tc, hours: h(ms) }; }).sort((x, y) => x.day < y.day ? -1 : x.day > y.day ? 1 : x.tech < y.tech ? -1 : 1);
  const bySection = [...S].map(([section, ms]) => ({ section, hours: h(ms) })).sort((x, y) => y.hours - x.hours);
  return { byTech, byDay, bySection, total: r2(byTech.reduce((s, t) => s + t.hours, 0)) };
}
