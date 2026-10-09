// End-to-end test of the API against a REAL MySQL / MariaDB. Skipped unless TEST_DATABASE_URL is set, e.g.
//   TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3306/mg_auto_test npm test
// Use an empty throw-away database: the test creates the tables and adds its own rows.
import test from 'node:test';
import assert from 'node:assert/strict';

const URL_ = process.env.TEST_DATABASE_URL;
const skip = URL_ ? false : 'set TEST_DATABASE_URL to run the API tests against a real MySQL';

test('API: full job card life, stock, roles and concurrency', { skip }, async t => {
  const { default: bcrypt } = await import('bcryptjs');
  const { createDb, newId } = await import('../db.js');
  const { loadConfig } = await import('../config.js');
  const { createNotifier } = await import('../notify.js');
  const { createApp } = await import('../app.js');

  const db = createDb({ DATABASE_URL: URL_ });
  await db.migrate();
  const cfg = loadConfig({ JWT_SECRET: 'test-secret-test-secret-test-secret', VAT_RATE: '0.15' });
  const notifier = createNotifier({ cfg, db });
  const server = createApp({ cfg, db, notifier }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await db.close(); });

  const suffix = Date.now().toString(36);
  const mk = async (role, name) => { await db.q('INSERT INTO app_users (id, username, name, role, pass_hash, created_at) VALUES (?,?,?,?,?, UTC_TIMESTAMP(3))', [newId(), `${role}-${suffix}`.toLowerCase(), `${name} ${suffix}`, role, await bcrypt.hash('password123', 4)]); return `${role}-${suffix}`.toLowerCase(); };
  const call = async (token, method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const login = async u => (await call(null, 'POST', '/api/auth/login', { username: u, password: 'password123' })).body.token;
  const [sa, ws, t1] = await Promise.all([login(await mk('SA', 'Almaz')), login(await mk('WS', 'Biruk')), login(await mk('TECH', 'Dawit'))]);

  assert.equal((await call(null, 'GET', '/health')).body.ok, true);
  assert.equal((await call(null, 'GET', '/api/data')).status, 401);
  assert.equal((await call(null, 'POST', '/api/auth/login', { username: 'nobody', password: 'x' })).status, 401);

  // customer, vehicle, job card
  const cus = (await call(sa, 'POST', '/api/customers', { name: 'Abebe', phone: '0911223344', dob: '1990-02-03' })).body;
  assert.match(cus.id, /^CUS-\d{8}-\d{4}$/); assert.equal(cus.dob, '1990-02-03');
  const veh = (await call(sa, 'POST', `/api/customers/${cus.id}/vehicles`, { plate: 'AA-1', brand: 'Toyota', model: 'Rav4' })).body;
  const part = (await call(sa, 'POST', '/api/inventory', { code: 'T-' + suffix, name: 'Test oil', price: 100, stock: 5, reorder: 1 })).body;
  assert.equal(part.stock, 5);
  assert.equal((await call(sa, 'POST', '/api/inventory', { code: 'T-' + suffix, name: 'dup' })).status, 409);
  assert.equal((await call(t1, 'POST', '/api/customers', { name: 'x', phone: '1' })).status, 403);

  const jc = (await call(sa, 'POST', '/api/jobs', { cid: cus.id, vid: veh.id, note: 'noise' })).body;
  assert.match(jc.id, /^TC-\d{8}-\d{4}$/);
  const J = p => `/api/jobs/${jc.id}${p}`;
  assert.equal((await call(sa, 'POST', J('/status'), { to: 'Dispatched' })).status, 400);       // no labour yet
  const lab = (await call(sa, 'POST', J('/labour'), { desc: 'Oil change', hours: 2 })).body.labours[0];
  assert.equal(lab.price, 700);

  // stock: issue takes it out, remove puts it back, too much is refused
  assert.equal((await call(sa, 'POST', J('/parts'), { pid: part.id, qty: 9 })).status, 409);
  assert.equal((await call(sa, 'POST', J('/parts'), { pid: part.id, qty: 2 })).status, 200);
  const stockNow = async () => (await call(sa, 'GET', '/api/data')).body.p.find(p => p.id === part.id).stock;
  assert.equal(await stockNow(), 3);
  assert.equal((await call(sa, 'DELETE', J('/parts/0'))).status, 200);
  assert.equal(await stockNow(), 5);
  await call(sa, 'POST', J('/parts'), { pid: part.id, qty: 1 });

  // workshop
  assert.equal((await call(sa, 'POST', J('/status'), { to: 'Dispatched' })).status, 200);
  assert.equal((await call(sa, 'POST', J('/status'), { to: 'At workshop' })).status, 403);
  assert.equal((await call(ws, 'POST', J('/status'), { to: 'At workshop' })).status, 200);
  const cin = p => call(t1, 'POST', J(`/labour/${lab.id}/clockin`), p);
  // the same technician clocking in twice at the same moment: exactly one wins
  const race = await Promise.all([cin(), cin()]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  assert.equal((await call(ws, 'POST', J('/status'), { to: 'Work done' })).status, 400);        // labour not completed
  assert.equal((await call(t1, 'POST', J(`/labour/${lab.id}/clockout`), { reason: 'Completed' })).status, 200);
  assert.equal((await call(ws, 'POST', J('/status'), { to: 'Work done' })).status, 200);
  assert.equal((await call(sa, 'POST', J('/status'), { to: 'Back with SA' })).status, 200);
  assert.equal((await call(sa, 'POST', J('/invoice'), { type: 'Cash' })).status, 409);          // not closed yet
  assert.equal((await call(sa, 'POST', J('/status'), { to: 'Closed' })).status, 200);

  // invoices: proformas repeat, one cash invoice, amounts frozen
  const pf = (await call(sa, 'POST', J('/invoice'), { type: 'Proforma' })).body;
  assert.equal(pf.status, 'Closed');
  const inv = (await call(sa, 'POST', J('/invoice'), { type: 'Cash' })).body;
  assert.equal(inv.status, 'Invoiced'); assert.equal(inv.inv.totals.sub, 800); assert.equal(inv.inv.totals.total, 920);
  assert.match(inv.inv.no, /^INV-\d{8}-\d{4}$/);
  assert.equal((await call(sa, 'POST', J('/invoice'), { type: 'Credit' })).status, 409);
  assert.equal((await call(sa, 'POST', J('/status'), { to: 'Delivered' })).status, 200);

  // notifications were logged (SMS and Telegram are not set up in the test, so both are "skipped")
  await new Promise(r => setTimeout(r, 300));
  const notes = (await call(sa, 'GET', J('/notifications'))).body;
  assert.ok(notes.length >= 1 && notes.every(n => n.status === 'skipped'));

  // reports and history
  const today = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  const rev = (await call(sa, 'GET', `/api/reports/revenue?from=${today}&to=${today}`)).body;
  assert.ok(rev.invoices.some(i => i.no === inv.inv.no && i.total === 920));
  const hrs = (await call(t1, 'GET', `/api/reports/hours?from=${today}&to=${today}`)).body;
  assert.ok(hrs.byTech.length <= 1);
  const moves = (await call(sa, 'GET', `/api/inventory/${part.id}/moves`)).body;
  assert.deepEqual(moves.map(m => m.reason).reverse(), ['Opening stock', 'Issued', 'Returned', 'Issued']);

  // a technician never receives the stock list
  assert.deepEqual((await call(t1, 'GET', '/api/data')).body.p, []);
});
