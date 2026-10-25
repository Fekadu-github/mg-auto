// Audit trail: who did what, and when. Every change (anything but a read) is written to audit_log after it is answered, together with refused
// attempts and sign-ins (failed ones too). Only the action, the record number and the person are kept: never the data sent, never a password.
const LABELS = [
  [/^POST \/api\/auth\/login$/, 'Sign in'],
  [/^POST \/api\/auth\/password$/, 'Own password changed'], [/^PUT \/api\/grns\/[^/]+$/, 'GRN edited'], [/^DELETE \/api\/grns\/[^/]+$/, 'GRN deleted'], [/^PUT \/api\/sales\/[^/]+$/, 'Sale edited'], [/^DELETE \/api\/sales\/[^/]+$/, 'Sale deleted'], [/^POST \/api\/users$/, 'Staff account created'], [/^PUT \/api\/users\/[^/]+$/, 'Staff account changed'], [/^DELETE \/api\/users\/[^/]+$/, 'Staff account deleted'],
  [/^POST \/api\/estimates$/, 'Estimate created'], [/^POST \/api\/estimates\/[^/]+\/finalize$/, 'Estimate finalized'], [/^POST \/api\/estimates\/[^/]+\/draft$/, 'Estimate back to draft'], [/^DELETE \/api\/estimates\/[^/]+$/, 'Estimate deleted'],
  [/^POST \/api\/proformas$/, 'Proforma created'], [/^POST \/api\/proformas\/[^/]+\/issue$/, 'Proforma finalized'], [/^POST \/api\/proformas\/[^/]+\/convert$/, 'Proforma turned into job card'], [/^DELETE \/api\/proformas\/[^/]+$/, 'Proforma deleted'],
  [/^POST \/api\/jobs$/, 'Job card created'], [/^DELETE \/api\/jobs\/[^/]+$/, 'Job card deleted'], [/^POST \/api\/jobs\/[^/]+\/estimate$/, 'Estimate loaded on job card'],
  [/^POST \/api\/jobs\/[^/]+\/close$/, 'Job card closed'], [/^POST \/api\/jobs\/[^/]+\/invoice$/, 'Invoice issued'], [/^POST \/api\/jobs\/[^/]+\/dispatch$/, 'Job card dispatched'],
  [/^PUT \/api\/settings\/labour-rates$/, 'Labour rates changed']
];
// Saving a draft happens every moment (auto-save): it is not an action worth a line
const SKIP = [/^PUT \/api\/(estimates|proformas)\//];

const isId = seg => /\d/.test(seg) || /^[0-9a-f-]{32,36}$/i.test(seg);   // EST-2026…, TC-2026…, uuids: a record number, not a word

export function describe(method, path) {
  const key = `${method} ${path}`;
  if (SKIP.some(r => r.test(key))) return { skip: true };
  const segs = path.split('/').filter(Boolean), ref = segs.find(isId) || '';
  const hit = LABELS.find(([r]) => r.test(key));
  return { action: hit ? hit[1] : `${method} ${segs.map(x => (isId(x) ? ':id' : x)).join('/')}`.slice(0, 120), ref: ref.slice(0, 60) };
}

export function auditMiddleware(db, { log = (...a) => console.error(...a) } = {}) {
  return (q, s, n) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(q.method)) return n();
    s.on('finish', () => {
      const path = (q.originalUrl || '').split('?')[0], d = describe(q.method, path);
      if (d.skip) return;
      const login = path === '/api/auth/login', who = q.u || (login ? { name: String(q.body?.username || '').slice(0, 60) } : {});
      const action = login ? (s.statusCode < 400 ? 'Sign in' : 'Failed sign in') : s.statusCode >= 400 ? `${d.action} (refused)` : d.action;
      db.q('INSERT INTO audit_log (at, user_id, user_name, role, method, path, action, ref, status, ip) VALUES (UTC_TIMESTAMP(3),?,?,?,?,?,?,?,?,?)',
        [who.id || null, who.name || '', who.role || '', q.method, path.slice(0, 200), action.slice(0, 120), d.ref, s.statusCode, String(q.ip || '').slice(0, 64)])
        .catch(e => log('audit log write failed:', e.message));   // never affects the person's work
    });
    n();
  };
}
