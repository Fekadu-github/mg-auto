// Pure helpers for the manager dashboard, the service-due list and the stock insight screens.
export const SOON_KM = 1000;   // "due soon" = this many km (or fewer) before the next service

// Vehicles whose next service is here or close, most overdue first. Needs the km the vehicle last had and the km of its next service.
export function serviceDue(db, soonKm = SOON_KM) {
  const cust = new Map((db.c || []).map(c => [c.id, c])), type = new Map((db.st || []).map(t => [t.code, t.name]));
  return (db.v || []).filter(v => v.next_km && v.mileage != null).map(v => {
    const left = +v.next_km - +v.mileage, c = cust.get(v.cid) || {};
    return { v, c, left, level: left <= 0 ? 'over' : left <= soonKm ? 'soon' : 'ok', what: type.get(v.next_type) || 'service' };
  }).filter(r => r.level !== 'ok').sort((a, b) => a.left - b.left);
}

// Who is clocked in, and on which job card: [{ tech, job, work, since }]
export function clockedIn(jobs, activeClock) {
  return jobs.flatMap(j => (j.labours || []).map(l => ({ j, l, a: activeClock(l) })).filter(x => x.a).map(({ j, l, a }) => ({ tech: a.tech, job: j.id, work: l.desc, since: a.in })));
}

// Points for the little sales line: values -> "x,y x,y ..." inside a w x h box
export function sparkPoints(values, w = 120, h = 32, pad = 2) {
  if (!values.length) return '';
  const max = Math.max(...values, 0), min = Math.min(...values, 0), span = max - min || 1, step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => `${+(pad + i * step).toFixed(1)},${+(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`).join(' ');
}
