// End-of-working-day clock-out. Pure functions (no database) plus one small database job, so they can be tested: node --test
// Addis Ababa is UTC+3 all year.

export const EAT = 3 * 3600e3, DAY = 86400e3;
const J = (v, d) => (v == null ? d : typeof v === 'string' ? JSON.parse(v) : v);   // JSON columns come back parsed on MySQL and as text on MariaDB (same as db.js)
export const parseHm = s => { const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };

// The moment a clock that started at `inMs` must be closed: the end of that working day, or midnight when it started after the end of the day.
export function cutoffFor(inMs, endMin) {
  const dayStart = Math.floor((inMs + EAT) / DAY) * DAY - EAT, end = dayStart + endMin * 60e3;
  return inMs < end ? end : dayStart + DAY;
}

// Close the running clocks of job cards (changes the objects). `endMin` = minutes after midnight, or null to close every running clock right now.
// Returns how many clocks were closed.
export function closeClocks(jobs, now, endMin = null, by = 'system') {
  let n = 0;
  for (const j of jobs) {
    let touched = 0;
    for (const l of j.labours || []) for (const x of l.logs || []) {
      if (x.out) continue;
      const cut = endMin === null ? now : cutoffFor(x.in, endMin);
      if (now < cut) continue;
      x.out = Math.max(x.in, cut); x.reason = 'End of work day'; x.auto = true; touched++;
    }
    if (touched) { (j.log = j.log || []).push({ s: 'Clocks closed (end of work day)', t: now, by, note: `${touched} running clock(s)` }); n += touched; }
  }
  return n;
}

// Database job: lock each job card in the workshop that has a running clock and close what is due. endMin null = close all now.
export async function closeRunningClocks(db, now = Date.now(), endMin = null, by = 'system') {
  const rows = await db.q("SELECT id, labours FROM jobs WHERE status = 'At workshop'");
  let total = 0;
  for (const r of rows) {
    if (!J(r.labours, []).some(l => (l.logs || []).some(x => !x.out))) continue;
    total += await db.tx(async c => {
      const [row] = await c.q('SELECT id, labours, `log` FROM jobs WHERE id = ? AND status = ? FOR UPDATE', [r.id, 'At workshop']);
      if (!row) return 0;
      const j = { labours: J(row.labours, []), log: J(row.log, []) }, n = closeClocks([j], now, endMin, by);
      if (n) await c.q('UPDATE jobs SET labours = ?, `log` = ? WHERE id = ?', [JSON.stringify(j.labours), JSON.stringify(j.log), r.id]);
      return n;
    });
  }
  return total;
}

// Check every minute whether the end of the working day has passed. `endHm` empty = no automatic clock-out.
export function startWorkdayTimer(db, endHm, log = console) {
  const endMin = parseHm(endHm);
  if (endMin === null) return () => {};
  const tick = () => closeRunningClocks(db, Date.now(), endMin).then(n => n && log.log(`Closed ${n} running clock(s) at the end of the working day.`)).catch(e => log.error('end-of-day clock-out:', e.message));
  const t = setInterval(tick, 60e3); t.unref?.(); tick();
  return () => clearInterval(t);
}
