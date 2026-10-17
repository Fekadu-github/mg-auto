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
  const [sa, ws, t1, mg] = await Promise.all([login(await mk('SA', 'Almaz')), login(await mk('WS', 'Biruk')), login(await mk('TECH', 'Dawit')), login(await mk('MGR', 'Mulu'))]);

  assert.equal((await call(null, 'GET', '/health')).body.ok, true);
  assert.equal((await call(null, 'GET', '/api/data')).status, 401);
  assert.equal((await call(null, 'POST', '/api/auth/login', { username: 'nobody', password: 'x' })).status, 401);

  // customer, vehicle, job card
  const cus = (await call(sa, 'POST', '/api/customers', { name: 'Abebe', phone: '0911223344', dob: '1990-02-03', tin: '0012345678' })).body;
  assert.equal(cus.tin, '0012345678');
  assert.match(cus.id, /^CUS-\d{8}-\d{4}$/); assert.equal(cus.dob, '1990-02-03');
  const veh = (await call(sa, 'POST', `/api/customers/${cus.id}/vehicles`, { plate: 'AA-1', brand: 'Toyota', model: 'Rav4', mileage: 1000 })).body;
  // only the manager creates items; the price fills itself as cost x 1.3 (76.92 x 1.3 = 100); part numbers start with S, T or B
  assert.equal((await call(sa, 'POST', '/api/inventory', { code: 'T' + suffix, name: 'x', cost: 1 })).status, 403);
  assert.equal((await call(mg, 'POST', '/api/inventory', { code: 'X' + suffix, name: 'wrong make', cost: 1 })).status, 400);
  const part = (await call(mg, 'POST', '/api/inventory', { code: 'T-' + suffix, name: 'Test oil', cost: 76.92, stock: 5, reorder: 1 })).body;
  assert.equal(part.stock, 5); assert.equal(part.price, 100); assert.equal(part.make, 'Toyota');
  assert.equal((await call(mg, 'POST', '/api/inventory', { code: 'T-' + suffix, name: 'dup', cost: 1 })).status, 409);
  assert.equal((await call(sa, 'GET', '/api/data')).body.p.find(x => x.id === part.id).cost, undefined);   // the cost is for the manager only
  assert.equal((await call(mg, 'GET', '/api/data')).body.p.find(x => x.id === part.id).cost, 76.92);
  assert.equal((await call(t1, 'POST', '/api/customers', { name: 'x', phone: '1' })).status, 403);

  const jc = (await call(sa, 'POST', '/api/jobs', { cid: cus.id, vid: veh.id, note: 'noise', mileage: 1200 })).body;
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

  // ---- garage workflow: mileage, service packages, selling prices, part requests, estimates ----
  const data = async () => (await call(sa, 'GET', '/api/data')).body;
  assert.equal((await call(sa, 'POST', `/api/customers/${cus.id}/vehicles`, { plate: 'AA-2' })).status, 400);       // mileage is registered with the vehicle
  const veh2 = (await call(sa, 'POST', `/api/customers/${cus.id}/vehicles`, { plate: 'AA-2', mileage: 4800 })).body;
  assert.equal(veh2.mileage, 4800);
  assert.equal((await call(sa, 'POST', '/api/jobs', { cid: cus.id, vid: veh2.id })).status, 400);                    // the card needs the mileage too
  assert.equal((await call(sa, 'POST', '/api/jobs', { cid: cus.id, vid: veh2.id, mileage: 4000 })).status, 400);     // and it cannot go backwards
  const j2 = (await call(sa, 'POST', '/api/jobs', { cid: cus.id, vid: veh2.id, mileage: 5000 })).body;
  assert.equal(j2.mileage, 5000);
  const K = p => `/api/jobs/${j2.id}${p}`;
  assert.deepEqual((await data()).st.map(t => t.code), ['A', 'B', 'C']);

  // Type A: its labour (priced from hours) and parts land on the card; only once
  const withA = (await call(sa, 'POST', K('/service'), { code: 'A' })).body;
  assert.deepEqual(withA.services, ['A']); assert.ok(withA.labours.length >= 2 && withA.labours.every(l => l.price > 0 && l.svc === 'A'));
  assert.equal((await call(sa, 'POST', K('/service'), { code: 'A' })).status, 409);

  // selling prices: the Service Advisor changes them, nobody else
  assert.equal((await call(sa, 'PUT', K(`/labour/${withA.labours[0].id}/price`), { price: 999 })).body.labours[0].price, 999);
  assert.equal((await call(sa, 'PUT', K('/parts/0/price'), { price: 60 })).body.parts[0].price, 60);
  assert.equal((await call(t1, 'PUT', K('/parts/0/price'), { price: 1 })).status, 403);

  // additional parts: the workshop asks, only the Service Advisor issues
  assert.equal((await call(sa, 'POST', K('/status'), { to: 'Dispatched' })).status, 200);
  assert.equal((await call(ws, 'POST', K('/status'), { to: 'At workshop' })).status, 200);
  assert.equal((await call(t1, 'POST', K('/parts'), { name: 'Brake pad', qty: 2, price: 10 })).status, 403);
  const asked = (await call(t1, 'POST', K('/requests'), { name: 'Brake pad', qty: 2 })).body;
  assert.equal(asked.requests[0].status, 'Requested');
  assert.equal((await call(t1, 'POST', K(`/requests/${asked.requests[0].id}/issue`), {})).status, 403);
  const issued = (await call(sa, 'POST', K(`/requests/${asked.requests[0].id}/issue`), { price: 300 })).body;
  assert.equal(issued.requests[0].status, 'Issued'); assert.ok(issued.parts.some(p => p.name === 'Brake pad' && p.price === 300 && p.qty === 2));
  const before = await stockNow();
  const asked2 = (await call(ws, 'POST', K('/requests'), { pid: part.id, qty: 1 })).body;
  assert.equal((await call(sa, 'POST', K(`/requests/${asked2.requests[1].id}/issue`), {})).status, 200);
  assert.equal(await stockNow(), before - 1);                                                                       // issued from stock, so it left stock

  // a waiting request blocks closing; rejecting it clears the block
  const asked3 = (await call(t1, 'POST', K('/requests'), { name: 'Bolt', qty: 1 })).body;
  for (const l of withA.labours) { await call(t1, 'POST', K(`/labour/${l.id}/clockin`)); await call(t1, 'POST', K(`/labour/${l.id}/clockout`), { reason: 'Completed' }); }
  assert.equal((await call(ws, 'POST', K('/status'), { to: 'Work done' })).status, 200);
  assert.equal((await call(sa, 'POST', K('/status'), { to: 'Back with SA' })).status, 200);
  assert.equal((await call(sa, 'POST', K('/status'), { to: 'Closed' })).status, 409);
  assert.equal((await call(sa, 'POST', K(`/requests/${asked3.requests[2].id}/reject`))).status, 200);
  assert.equal((await call(sa, 'POST', K('/status'), { to: 'Closed' })).status, 200);

  // closing moves the vehicle's mileage forward and suggests the next service: after an A at 5 000 km comes the B at 10 000 km
  const v2 = (await data()).v.find(v => v.id === veh2.id);
  assert.deepEqual([v2.mileage, v2.next_km, v2.next_type], [5000, 10000, 'B']);

  // the advisor sends the closed card back to the workshop with one more task; the workshop clocks it and sends it back
  const back = (await call(sa, 'POST', K('/return'))).body;
  assert.equal(back.status, 'Dispatched');
  const more = (await call(sa, 'POST', K('/labour'), { desc: 'Rear light', section: 'Mechanical Repairs', hours: 1 })).body;
  const extra = more.labours.at(-1); assert.deepEqual([extra.done, extra.price], [false, 350]);
  assert.equal((await call(ws, 'POST', K('/status'), { to: 'At workshop' })).status, 200);
  assert.equal((await call(sa, 'POST', K('/labour'), { desc: 'x' })).status, 409);                                  // not while it is in the workshop
  await call(t1, 'POST', K(`/labour/${extra.id}/clockin`)); await call(t1, 'POST', K(`/labour/${extra.id}/clockout`), { reason: 'Completed' });
  assert.equal((await call(ws, 'POST', K('/status'), { to: 'Work done' })).status, 200);
  assert.equal((await call(sa, 'POST', K('/status'), { to: 'Back with SA' })).status, 200);
  assert.equal((await call(sa, 'POST', K('/status'), { to: 'Closed' })).status, 200);

  // a closed card can still be corrected (a late billing line, a part) until the invoice
  const lateLine = (await call(sa, 'POST', K('/labour'), { desc: 'Wash', hours: 0.5 })).body.labours.at(-1);
  assert.deepEqual([lateLine.done, lateLine.late], [true, true]);
  assert.equal((await call(sa, 'POST', K('/parts'), { name: 'Sticker', qty: 1, price: 20 })).status, 200);

  // prices are still open after closing, but not after the invoice
  assert.equal((await call(sa, 'PUT', K('/parts/0/price'), { price: 70 })).status, 200);
  assert.equal((await call(sa, 'POST', K('/invoice'), { type: 'Cash' })).status, 200);
  assert.equal((await call(sa, 'PUT', K('/parts/0/price'), { price: 80 })).status, 409);

  // estimates: draft -> finalized -> loaded on a job card by its number
  const est = (await call(sa, 'POST', '/api/estimates', { cid: cus.id, vid: veh2.id, note: 'rear bumper' })).body;
  assert.match(est.id, /^EST-\d{8}-\d{4}$/); assert.equal(est.status, 'Draft');
  const E = p => `/api/estimates/${est.id}${p}`;
  assert.equal((await call(sa, 'POST', E('/finalize'))).status, 400);                                                // nothing on it yet
  const filled = (await call(sa, 'PUT', E(''), { note: 'rear bumper', labours: [{ desc: 'Panel beating', hours: 3 }], parts: [{ pid: part.id, qty: 1, price: '' }, { name: 'Clips', qty: 4, price: 5 }] })).body;
  assert.equal(filled.labours[0].price, 1050); assert.equal(filled.parts[0].price, 100);
  const j3 = (await call(sa, 'POST', '/api/jobs', { cid: cus.id, vid: veh2.id, mileage: 5100 })).body;
  const L = p => `/api/jobs/${j3.id}${p}`;
  assert.equal((await call(sa, 'POST', L('/estimate'), { no: est.id })).status, 409);                                // still a draft
  assert.equal((await call(sa, 'POST', E('/finalize'))).body.status, 'Finalized');
  assert.equal((await call(sa, 'PUT', E(''), { labours: [] })).status, 409);                                        // finalized is locked
  const stockBefore = await stockNow();
  const loaded = (await call(sa, 'POST', L('/estimate'), { no: est.id })).body;
  assert.equal(loaded.est, est.id); assert.equal(loaded.labours[0].section, 'Body & Paints'); assert.equal(loaded.parts.length, 2);
  assert.equal(await stockNow(), stockBefore - 1);
  assert.equal((await call(sa, 'POST', L('/estimate'), { no: est.id })).status, 409);                                // only once
  assert.equal((await data()).e.find(e => e.id === est.id).used_in, j3.id);
  assert.equal((await call(sa, 'POST', E('/draft'))).status, 409);                                                   // used: cannot go back to draft

  // ---- first-hand insurance proforma: draft -> issued -> job card + estimate ----
  const co = (await call(sa, 'POST', '/api/insurers', { name: 'Awash Insurance', phone: '0111' })).body;
  assert.equal((await call(sa, 'POST', '/api/insurers', { name: 'Awash Insurance' })).status, 409);
  assert.equal((await call(sa, 'PUT', `/api/customers/${cus.id}`, { name: cus.name, phone: cus.phone, insurer_id: co.id, policy_no: 'P-1' })).status, 200);
  const pro = (await call(sa, 'POST', '/api/proformas', { cid: cus.id, vid: veh2.id })).body;
  assert.match(pro.id, /^PRO-\d{8}-\d{4}$/); assert.deepEqual([pro.status, pro.insurer_id, pro.policy_no], ['Draft', co.id, 'P-1']);   // starts from the customer's insurance
  const P = p => `/api/proformas/${pro.id}${p}`;
  assert.equal((await call(sa, 'POST', P('/issue'))).status, 400);                                                    // nothing on it yet
  const task = (await data()).lt.find(t => t.section === 'Body & Paints');
  const filled2 = (await call(sa, 'PUT', P(''), { note: 'front door', pdate: '2026-10-09', insurer_id: co.id, labours: [{ desc: task.name, section: task.section, hours: task.hours }], parts: [{ pid: part.id, qty: 1, price: '' }] })).body;
  assert.equal(filled2.labours[0].section, 'Body & Paints'); assert.equal(filled2.pdate, '2026-10-09');
  assert.equal((await call(sa, 'POST', P('/convert'), { mileage: 6000 })).status, 409);                               // issue and print first
  assert.equal((await call(sa, 'POST', P('/issue'))).body.status, 'Issued');
  assert.equal((await call(sa, 'POST', P('/convert'), {})).status, 400);                                              // the job card needs the mileage
  const stockBeforePro = await stockNow();
  const made = (await call(sa, 'POST', P('/convert'), { mileage: 6000 })).body;
  assert.match(made.job, /^TC-/); assert.equal(await stockNow(), stockBeforePro - 1);
  const dj = (await data()), j4 = dj.j.find(x => x.id === made.job), pr2 = dj.pr.find(x => x.id === pro.id);
  assert.deepEqual([pr2.status, pr2.job, j4.est, j4.mileage, j4.labours[0].section], ['Converted', made.job, pr2.est, 6000, 'Body & Paints']);
  assert.match(j4.note, /Awash Insurance/); assert.deepEqual([j4.payer, j4.policy_no], ['Awash Insurance', 'P-1']);   // the invoice is made out to the insurance
  assert.equal(dj.j.find(x => x.id === j2.id).payer, null);                                                           // a job made by the customer is billed to the customer
  const e2 = dj.e.find(x => x.id === pr2.est); assert.deepEqual([e2.status, e2.used_in, e2.pro], ['Finalized', made.job, pro.id]);
  // the insurance can be swapped for the customer (or another company) until the invoice
  const asCustomer = (await call(sa, 'PUT', `/api/jobs/${made.job}/payer`, { insurer_id: '' })).body;
  assert.deepEqual([asCustomer.payer, asCustomer.policy_no], [null, null]);
  assert.equal((await call(sa, 'PUT', `/api/jobs/${made.job}/payer`, { insurer_id: 'nope' })).status, 400);
  const asIns = (await call(sa, 'PUT', `/api/jobs/${made.job}/payer`, { insurer_id: co.id, policy_no: 'P-2' })).body;
  assert.deepEqual([asIns.payer, asIns.policy_no], ['Awash Insurance', 'P-2']);
  assert.equal((await call(t1, 'PUT', `/api/jobs/${made.job}/payer`, { insurer_id: '' })).status, 403);
  assert.equal((await call(sa, 'POST', P('/convert'), { mileage: 6000 })).status, 409);                               // only once
  assert.equal((await call(sa, 'PUT', P(''), { labours: [] })).status, 409);

  // ---- stock page and point of sale ----
  const p2 = (await call(mg, 'POST', '/api/inventory', { code: 'S' + suffix, name: 'Spark plug', cost: 100, stock: 3, reorder: 2 })).body;
  assert.equal(p2.price, 130);                                                                                       // cost x 1.3
  assert.equal((await call(sa, 'PUT', `/api/inventory/${p2.id}`, { price: 1 })).status, 403);                       // the price is the manager's
  assert.equal((await call(mg, 'PUT', `/api/inventory/${p2.id}`, { price: 140 })).body.price, 140);                 // typed over
  assert.equal((await call(mg, 'PUT', `/api/inventory/${p2.id}`, { cost: 100, price: 130 })).body.price, 130);
  const stock2 = async () => (await call(sa, 'GET', '/api/data')).body.p.find(x => x.id === p2.id).stock;
  const cash = (await call(sa, 'POST', '/api/sales', { kind: 'Cash', name: 'Walk-in', tin: '999', lines: [{ pid: p2.id, qty: 2 }] })).body;
  assert.match(cash.id, /^INV-\d{8}-\d{4}$/); assert.equal(cash.totals.total, 299); assert.equal(cash.cust_tin, '999'); assert.equal(await stock2(), 1);   // 2 x 130 + 15% VAT
  const refused = await call(sa, 'POST', '/api/sales', { kind: 'Cash', lines: [{ pid: p2.id, qty: 5 }] });
  assert.equal(refused.status, 409); assert.equal(await stock2(), 1);
  const lost = (await call(sa, 'GET', '/api/reports/lost?from=2000-01-01&to=2100-01-01')).body;
  assert.ok(lost.rows.some(r => r.code === p2.code && r.qty === 5));                                                  // the refused sale was written down
  const quote = (await call(sa, 'POST', '/api/sales', { kind: 'Proforma', name: 'Quote', show_codes: false, lines: [{ pid: p2.id, qty: 50 }] })).body;
  assert.equal(quote.show_codes, false); assert.equal(await stock2(), 1);                                               // a proforma is only a quote
  assert.equal((await call(sa, 'POST', '/api/sales', { kind: 'Credit', lines: [{ pid: p2.id, qty: 1 }] })).status, 400);   // credit needs a name
  const credit = (await call(sa, 'POST', '/api/sales', { kind: 'Credit', name: 'Garage X', lines: [{ pid: p2.id, qty: 1 }] })).body;
  const invRow = async () => (await call(sa, 'GET', '/api/invoices')).body.find(r => r.ref === credit.id);
  assert.deepEqual([(await invRow()).type, (await invRow()).status], ['Credit', 'Unpaid']);                                // sales reach the invoice module by themselves
  assert.ok((await call(sa, 'GET', '/api/invoices')).body.some(r => r.ref === cash.id && r.status === 'Paid'));
  assert.equal((await call(sa, 'POST', '/api/payments', { source: 'sale', ref: credit.id, amount: 50 })).body.status, 'Part paid');
  assert.equal((await call(sa, 'POST', '/api/payments', { source: 'sale', ref: credit.id, amount: 9999 })).status, 400);
  assert.equal((await call(sa, 'POST', '/api/payments', { source: 'sale', ref: credit.id, amount: credit.totals.total - 50 })).body.status, 'Paid');
  assert.equal((await call(sa, 'POST', `/api/sales/${cash.id}/cancel`, { reason: 'wrong part' })).status, 403);       // only the manager cancels
  assert.equal((await call(mg, 'POST', `/api/sales/${cash.id}/cancel`, { reason: 'wrong part' })).body.status, 'Cancelled');
  assert.equal(await stock2(), 2);                                                                                   // 3 - 2 cash - 1 credit + 2 back from the cancelled cash sale
  assert.equal((await call(mg, 'POST', '/api/inventory/bulk-price', { percent: 10 })).status, 200);                  // all prices up 10%
  assert.equal((await call(sa, 'POST', '/api/inventory/bulk-price', { percent: 10 })).status, 403);
  assert.equal((await call(sa, 'GET', '/api/data')).body.p.find(x => x.id === p2.id).price, 143);
  assert.equal((await call(sa, 'GET', '/api/reports/inventory')).status, 403);                                        // inventory control shows costs: manager only
  assert.equal((await call(mg, 'GET', '/api/reports/inventory')).status, 200);
});
