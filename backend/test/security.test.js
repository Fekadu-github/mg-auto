import test from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders, rateLimit, requestLog } from '../security.js';
import { describe, auditMiddleware } from '../audit.js';

const res = () => {
  const r = { headers: {}, code: 200, body: null, handlers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.removeHeader = k => { delete r.headers[k]; };
  r.status = c => { r.code = c; r.statusCode = c; return r; }; r.json = b => { r.body = b; return r; };
  r.statusCode = 200; r.on = (e, f) => { r.handlers[e] = f; };
  return r;
};

test('security headers: no sniffing, no framing, no caching of API data, HSTS only on HTTPS', () => {
  const s = res(); let next = 0;
  securityHeaders()({ secure: true, originalUrl: '/api/data' }, s, () => next++);
  assert.equal(next, 1);
  assert.equal(s.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(s.headers['X-Frame-Options'], 'DENY');
  assert.equal(s.headers['Cache-Control'], 'no-store');
  assert.match(s.headers['Strict-Transport-Security'], /max-age/);
  const plain = res();
  securityHeaders()({ secure: false, originalUrl: '/index.html' }, plain, () => {});
  assert.equal(plain.headers['Strict-Transport-Security'], undefined);
  assert.equal(plain.headers['Cache-Control'], undefined);
});

test('rate limit: the request over the limit is refused with Retry-After, and the window then starts again', () => {
  let t = 0; const lim = rateLimit({ windowMs: 1000, max: 3, now: () => t });
  const hit = ip => { const s = res(); let ok = false; lim({ ip }, s, () => { ok = true; }); return { ok, s }; };
  assert.ok(hit('a').ok && hit('a').ok && hit('a').ok);
  const over = hit('a');
  assert.equal(over.ok, false); assert.equal(over.s.code, 429); assert.ok(+over.s.headers['Retry-After'] >= 1);
  assert.ok(hit('b').ok);                 // another address is not affected
  t = 1001; assert.ok(hit('a').ok);       // new window
});

test('request log: one JSON line with id, method, path, status and user; health checks are skipped', () => {
  const lines = []; let t = 1000; const mw = requestLog({ log: l => lines.push(l), now: () => (t += 5) });
  const s = res(); s.statusCode = 201;
  mw({ method: 'POST', originalUrl: '/api/jobs?x=1', u: { name: 'Abebe' } }, s, () => {}); s.handlers.finish();
  const l = JSON.parse(lines[0]);
  assert.deepEqual([l.m, l.p, l.s, l.u], ['POST', '/api/jobs', 201, 'Abebe']); assert.ok(l.id && s.headers['X-Request-Id'] === l.id);
  const h = res(); mw({ method: 'GET', originalUrl: '/health' }, h, () => {}); h.handlers.finish();
  assert.equal(lines.length, 1);
});

test('audit: readable action names, the record number, and auto-save is not logged', () => {
  assert.deepEqual(describe('POST', '/api/estimates/EST-20261021-0001/finalize'), { action: 'Estimate finalized', ref: 'EST-20261021-0001' });
  assert.deepEqual(describe('DELETE', '/api/proformas/EST-20261021-0001'), { action: 'Proforma deleted', ref: 'EST-20261021-0001' });
  assert.deepEqual(describe('DELETE', '/api/users/6f1c2f0e-8a54-4a33-9d1a-3f0a1a2b3c4d').action, 'Staff account deleted');
  assert.equal(describe('PUT', '/api/proformas/EST-1').skip, true);
  assert.equal(describe('POST', '/api/jobs/TC-20261021-0002/labour/abc12345/clockin').action, 'POST api/jobs/:id/labour/:id/clockin');
});

test('audit: a change is written after it is answered (with the person), a read is not, a failed sign-in is named; never the body', async () => {
  const rows = []; const db = { q: async (sql, p) => { rows.push(p); } };
  const mw = auditMiddleware(db);
  const run = (q, code) => { const s = res(); s.statusCode = code; mw(q, s, () => {}); s.handlers.finish?.(); };
  run({ method: 'GET', originalUrl: '/api/data' }, 200);
  run({ method: 'POST', originalUrl: '/api/jobs/TC-1/close', u: { id: 'u1', name: 'Sara', role: 'SA' }, ip: '1.2.3.4', body: { password: 'secret' } }, 200);
  run({ method: 'POST', originalUrl: '/api/auth/login', body: { username: 'Dawit', password: 'wrong-password' }, ip: '1.2.3.4' }, 401);
  await new Promise(r => setImmediate(r));
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0][1], rows[0][5], rows[0][6], rows[0][7]], ['Sara', 'Job card closed', 'TC-1', 200]);
  assert.deepEqual([rows[1][1], rows[1][5], rows[1][7]], ['Dawit', 'Failed sign in', 401]);
  assert.ok(!JSON.stringify(rows).includes('secret') && !JSON.stringify(rows).includes('wrong-password'));
});
