// Vehicle photos take a lot of database space. A photo is deleted by itself PHOTO_KEEP_DAYS (5) days after its car was delivered.
// "Delivered" time = the time of the last 'Delivered' line in the job card's status log. Pure helper + one small database job.
const DAY = 86400e3;
const J = (v, d) => (v == null ? d : typeof v === 'string' ? JSON.parse(v) : v);

export const deliveredAt = log => (J(log, []) || []).filter(x => x && x.s === 'Delivered').reduce((m, x) => Math.max(m, +x.t || 0), 0) || null;
export const photosExpired = (log, now, days = 5) => { const t = deliveredAt(log); return t !== null && now - t >= days * DAY; };

// Delete the photos of every delivered card whose delivery is old enough. Returns how many photos were removed. Never throws.
export async function cleanDeliveredPhotos(db, now = Date.now(), days = 5) {
  try {
    const rows = await db.q("SELECT j.id, j.log FROM jobs j WHERE j.status = 'Delivered' AND EXISTS (SELECT 1 FROM job_photos p WHERE p.job_id = j.id)");
    let n = 0;
    for (const r of rows) if (photosExpired(r.log, now, days)) { const res = await db.q('DELETE FROM job_photos WHERE job_id = ?', [r.id]); n += res?.affectedRows ?? 0; }
    if (n) console.log(`Photo clean-up: ${n} photo(s) deleted (delivered ${days}+ days ago)`);
    return n;
  } catch (e) { console.error('Photo clean-up skipped:', e.message); return 0; }
}

// Runs once at start and then every hour. Returns a function that stops it.
export function startPhotoCleanup(db, days = 5, everyMs = 3600e3) {
  const run = () => cleanDeliveredPhotos(db, Date.now(), days);
  run();
  const t = setInterval(run, everyMs); t.unref?.();
  return () => clearInterval(t);
}
