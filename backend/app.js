import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fail } from './errors.js';
import { adjustStock, newId, numberFor, J } from './db.js';
import { range, hoursReport, revenueReport } from './lib.js';
import * as rules from './rules.js';
import { str, qn } from './rules.js';

const jobRow = r => r && ({ id: r.id, cid: r.cid, vid: r.vid, note: r.note, status: r.status, created: r.created, labours: J(r.labours, []), parts: J(r.parts, []), inv: J(r.inv, null), log: J(r.log, []) });
const partRow = r => r && ({ ...r, price: +r.price, stock: +r.stock, reorder: +r.reorder, active: !!r.active });
const sendJson = v => JSON.stringify(v);

export function createApp({ cfg, db, notifier }) {
  const S = cfg.jwtSecret, app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use(cors({ origin: cfg.corsOrigin === '*' ? true : cfg.corsOrigin.split(',').map(s => s.trim()) }));

  // async route wrapper: HTTP errors thrown with fail() are answered as they are; anything else is logged and answered as a plain 500
  const wrap = f => (q, s) => f(q, s).catch(e => {
    if (Number.isInteger(e.code)) return s.status(e.code).json({ error: e.message });
    if (e.code === 'ER_DUP_ENTRY') return s.status(409).json({ error: 'This record already exists' });
    console.error(q.method, q.path, e);
    s.status(500).json({ error: 'Server error. Please try again.' });
  });
  const auth = (...roles) => (q, s, n) => {
    try { q.u = jwt.verify((q.headers.authorization || '').slice(7), S); }
    catch { return s.status(401).json({ error: 'Sign in required' }); }
    if (roles.length && !['ADMIN', ...roles].includes(q.u.role)) return s.status(403).json({ error: 'Your role cannot do this' });
    n();
  };

  // ---- health, auth & staff ----
  app.get('/health', async (q, s) => { try { await db.q('SELECT 1'); s.json({ ok: true }); } catch { s.status(503).json({ ok: false }); } });

  const tries = new Map();
  app.post('/api/auth/login', wrap(async (q, s) => {
    const ip = q.ip, t = tries.get(ip) || { n: 0, at: Date.now() };
    if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now(); }
    if (t.n >= 10) fail(429, 'Too many attempts. Try again in 15 minutes.');
    const [u] = await db.q('SELECT * FROM app_users WHERE username = ?', [str(q.body.username).toLowerCase()]);
    if (!u || !(await bcrypt.compare(str(q.body.password, 100), u.pass_hash))) { t.n++; tries.set(ip, t); fail(401, 'Wrong username or password'); }
    const user = { id: u.id, name: u.name, role: u.role };
    s.json({ user, token: jwt.sign(user, S, { expiresIn: '12h' }) });
  }));
  app.get('/api/users', auth('ADMIN'), wrap(async (q, s) => s.json(await db.q('SELECT id, username, name, role FROM app_users ORDER BY created_at, username'))));
  app.post('/api/users', auth('ADMIN'), wrap(async (q, s) => {
    const { name, username, password, role } = q.body;
    if (!str(name) || !str(username)) fail(400, 'Name and username are required');
    if (!['SA', 'WS', 'TECH', 'ADMIN'].includes(role)) fail(400, 'Unknown role');
    if (str(password, 100).length < 8) fail(400, 'Password needs at least 8 characters');
    const u = { id: newId(), username: str(username, 60).toLowerCase(), name: str(name, 120), role };
    await db.q('INSERT INTO app_users (id, username, name, role, pass_hash, created_at) VALUES (?,?,?,?,?, UTC_TIMESTAMP(3))', [u.id, u.username, u.name, u.role, await bcrypt.hash(str(password, 100), 10)]);
    s.json(u);
  }));

  // ---- everything the screens need, in one call ----
  app.get('/api/data', auth(), wrap(async (q, s) => {
    const staff = q.u.role !== 'TECH';
    const [c, v, j, p] = await Promise.all([
      db.q("SELECT id, name, phone, city, sub, woreda, house, dob, notify, (tg_chat IS NOT NULL) AS tg, created_at FROM customers ORDER BY created_at, id"),   // never send the Telegram chat id or link token to the browser
      db.q('SELECT id, cid, plate, vin, eng, col, brand, model, created_at FROM vehicles ORDER BY created_at, id'),
      db.q('SELECT * FROM jobs ORDER BY created DESC, id DESC'),
      staff ? db.q('SELECT * FROM inventory WHERE active = 1 ORDER BY name') : []]);
    s.json({ c: c.map(r => ({ ...r, tg: !!r.tg })), v, j: j.map(jobRow), p: p.map(partRow),
      cfg: { vat: cfg.vat, labourRate: cfg.labourRate, tgBot: notifier.botName, sms: notifier.smsReady, garage: cfg.garage } });
  }));

  // ---- customers & vehicles ----
  const cf = b => ({ name: str(b.name), phone: str(b.phone, 30), city: str(b.city), sub: str(b.sub), woreda: str(b.woreda), house: str(b.house), dob: /^\d{4}-\d{2}-\d{2}$/.test(b.dob || '') ? b.dob : null, notify: ['both', 'sms', 'telegram', 'none'].includes(b.notify) ? b.notify : 'both' });
  const vf = b => ({ plate: str(b.plate, 30), vin: str(b.vin, 40), eng: str(b.eng, 40), col: str(b.col, 30), brand: str(b.brand, 40), model: str(b.model, 60) });
  const customer = async id => (await db.q('SELECT id, name, phone, city, sub, woreda, house, dob, notify, (tg_chat IS NOT NULL) AS tg, created_at FROM customers WHERE id = ?', [id]))[0];
  const vehicle = async id => (await db.q('SELECT id, cid, plate, vin, eng, col, brand, model, created_at FROM vehicles WHERE id = ?', [id]))[0];

  app.post('/api/customers', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.name) || !str(q.body.phone)) fail(400, 'Name and phone are required');
    const f = cf(q.body);
    const id = await db.tx(async c => {
      const id = await numberFor(c, 'customer', 'CUS-');
      await c.q('INSERT INTO customers (id, name, phone, city, sub, woreda, house, dob, notify, created_at) VALUES (?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [id, f.name, f.phone, f.city, f.sub, f.woreda, f.house, f.dob, f.notify]);
      return id;
    });
    const c = await customer(id);
    s.json({ ...c, tg: !!c.tg });
  }));
  app.put('/api/customers/:id', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.name) || !str(q.body.phone)) fail(400, 'Name and phone are required');
    const f = cf(q.body);
    const r = await db.q('UPDATE customers SET name=?, phone=?, city=?, sub=?, woreda=?, house=?, dob=?, notify=? WHERE id=?', [f.name, f.phone, f.city, f.sub, f.woreda, f.house, f.dob, f.notify, q.params.id]);
    if (!r.affectedRows && !(await customer(q.params.id))) fail(404, 'Customer not found');   // MySQL counts "matched but unchanged" as 0 affected rows
    s.json({ ok: true });
  }));
  app.post('/api/customers/:id/vehicles', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.plate)) fail(400, 'Plate is required');
    if (!(await customer(q.params.id))) fail(404, 'Customer not found');
    const f = vf(q.body), id = newId();
    await db.q('INSERT INTO vehicles (id, cid, plate, vin, eng, col, brand, model, created_at) VALUES (?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [id, q.params.id, f.plate, f.vin, f.eng, f.col, f.brand, f.model]);
    s.json(await vehicle(id));
  }));
  app.put('/api/vehicles/:id', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.plate)) fail(400, 'Plate is required');
    const f = vf(q.body);
    await db.q('UPDATE vehicles SET plate=?, vin=?, eng=?, col=?, brand=?, model=? WHERE id=?', [f.plate, f.vin, f.eng, f.col, f.brand, f.model, q.params.id]);
    const v = await vehicle(q.params.id);
    if (!v) fail(404, 'Vehicle not found');
    s.json(v);
  }));

  // ---- Telegram linking ----
  app.post('/api/customers/:id/telegram-link', auth('SA'), wrap(async (q, s) => {
    if (!notifier.botName) fail(409, 'The Telegram bot is not set up on the server');
    if (!(await customer(q.params.id))) fail(404, 'Customer not found');
    const token = randomBytes(12).toString('base64url');
    await db.q('UPDATE customers SET tg_token = ? WHERE id = ?', [token, q.params.id]);
    s.json({ url: `https://t.me/${notifier.botName}?start=${token}` });
  }));
  app.post('/api/telegram/webhook', (q, s) => {
    if (!notifier.enabled || q.get('x-telegram-bot-api-secret-token') !== notifier.secret) return s.sendStatus(403);
    s.sendStatus(200);
    notifier.handleUpdate(q.body).catch(e => console.error('telegram webhook:', e.message));
  });

  // ---- parts inventory ----
  // Stock only ever changes through adjustStock: atomic, never below zero, and every change is written to stock_moves.
  const stock = async (c, id, d, reason, job, by, note) => {
    const bal = await adjustStock(c, id, d, reason, job, by, note);
    if (bal === null) fail(d > 0 ? 404 : 409, d > 0 ? 'Part not found' : 'Not enough stock');
    return bal;
  };
  app.post('/api/inventory', auth('SA'), wrap(async (q, s) => {
    const f = { code: str(q.body.code, 40).toUpperCase(), name: str(q.body.name, 120), price: Math.max(0, +q.body.price || 0), reorder: Math.max(0, +q.body.reorder || 0) };
    if (!f.code || !f.name) fail(400, 'Part code and name are required');
    const open = qn(q.body.stock), id = newId();
    await db.tx(async c => {
      if ((await c.q('SELECT id FROM inventory WHERE code = ?', [f.code])).length) fail(409, 'A part with this code already exists');
      await c.q('INSERT INTO inventory (id, code, name, price, stock, reorder, active, created_at) VALUES (?,?,?,?,0,?,1, UTC_TIMESTAMP(3))', [id, f.code, f.name, f.price, f.reorder]);
      if (open > 0) await stock(c, id, open, 'Opening stock', null, q.u.name);
    });
    s.json(partRow((await db.q('SELECT * FROM inventory WHERE id = ?', [id]))[0]));
  }));
  app.put('/api/inventory/:id', auth('SA'), wrap(async (q, s) => {
    const sets = [], vals = [];
    if (q.body.name !== undefined) { const n = str(q.body.name, 120); if (!n) fail(400, 'Name is required'); sets.push('name = ?'); vals.push(n); }
    if (q.body.price !== undefined) { sets.push('price = ?'); vals.push(Math.max(0, +q.body.price || 0)); }
    if (q.body.reorder !== undefined) { sets.push('reorder = ?'); vals.push(Math.max(0, +q.body.reorder || 0)); }
    if (q.body.active !== undefined) { sets.push('active = ?'); vals.push(q.body.active ? 1 : 0); }
    if (sets.length) await db.q(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`, [...vals, q.params.id]);
    const p = (await db.q('SELECT * FROM inventory WHERE id = ?', [q.params.id]))[0];
    if (!p) fail(404, 'Part not found');
    s.json(partRow(p));
  }));
  app.post('/api/inventory/:id/receive', auth('SA'), wrap(async (q, s) => {
    const n = qn(q.body.qty);
    if (!(n > 0)) fail(400, 'Enter a quantity above zero');
    s.json({ stock: await db.tx(c => stock(c, q.params.id, n, 'Received', null, q.u.name, str(q.body.note, 200))) });
  }));
  app.post('/api/inventory/:id/adjust', auth('SA'), wrap(async (q, s) => {
    const cnt = qn(q.body.count);
    if (!(cnt >= 0)) fail(400, 'Enter the counted quantity');
    if (!str(q.body.note)) fail(400, 'Say why (for example: stock count, damaged)');
    s.json({ stock: await db.tx(async c => {
      const [p] = await c.q('SELECT id, stock FROM inventory WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!p) fail(404, 'Part not found');
      const d = qn(cnt - p.stock);
      return d ? stock(c, p.id, d, 'Adjusted', null, q.u.name, str(q.body.note, 200)) : +p.stock;
    }) });
  }));
  app.get('/api/inventory/:id/moves', auth('SA', 'WS'), wrap(async (q, s) =>
    s.json((await db.q('SELECT id, part_id, delta, balance, reason, job, by_name, note, `at` FROM stock_moves WHERE part_id = ? ORDER BY `at` DESC, id DESC LIMIT 100', [q.params.id])).map(m => ({ ...m, delta: +m.delta, balance: +m.balance })))));

  // ---- job cards ----
  app.post('/api/jobs', auth('SA'), wrap(async (q, s) => {
    const { cid, vid } = q.body;
    if (!(await db.q('SELECT id FROM vehicles WHERE id = ? AND cid = ?', [vid, cid])).length) fail(400, 'Vehicle does not belong to this customer');
    const id = await db.tx(async c => {
      const id = await numberFor(c, 'job', 'TC-');
      await c.q('INSERT INTO jobs (id, cid, vid, note, status, created, labours, parts, inv, `log`) VALUES (?,?,?,?,?, UTC_TIMESTAMP(3), ?, ?, NULL, ?)',
        [id, cid, vid, str(q.body.note, 500), 'Created', '[]', '[]', sendJson([{ s: 'Created', t: Date.now(), by: q.u.name }])]);
      return id;
    });
    s.json(jobRow((await db.q('SELECT * FROM jobs WHERE id = ?', [id]))[0]));
  }));

  // Lock the job row, let fn change it, save it, commit. Everything fn does to stock and counters is in the same transaction,
  // so a failure anywhere undoes all of it and two people changing the same card at once simply take turns.
  // fn(j, ctx) may push callbacks into ctx.after; they run once the change is committed.
  const edit = (roles, fn) => [auth(...roles), wrap(async (q, s) => {
    const { saved, after } = await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM jobs WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Job card not found');
      const j = jobRow(row), after = [];
      await fn(j, { q, c, u: q.u, body: q.body, params: q.params, after });
      await c.q('UPDATE jobs SET labours = ?, parts = ?, status = ?, inv = ?, `log` = ? WHERE id = ?',
        [sendJson(j.labours), sendJson(j.parts), j.status, j.inv ? sendJson(j.inv) : null, sendJson(j.log), j.id]);
      return { saved: j, after };
    });
    after.forEach(f => Promise.resolve(f(saved)).catch(e => console.error(e.message)));
    s.json(saved);
  })];

  app.post('/api/jobs/:id/labour', ...edit(['SA'], (j, { body }) => rules.addLabour(j, body, cfg.labourRate)));
  app.delete('/api/jobs/:id/labour/:lid', ...edit(['SA'], (j, { params }) => rules.removeLabour(j, params.lid)));

  // SA issues parts on the job card. A part picked from the stock list (pid) is taken out of stock; anything else is free text and not tracked.
  app.post('/api/jobs/:id/parts', ...edit(['SA'], async (j, { body, c, u }) => {
    rules.assertPartsOpen(j);
    if (!body.pid) return rules.addFreePart(j, body);
    const qty = rules.partQty(body.qty);
    const [p] = await c.q('SELECT * FROM inventory WHERE id = ? AND active = 1 FOR UPDATE', [body.pid]);
    if (!p) fail(404, 'Part not found in stock list');
    if (+p.stock < qty) fail(409, `Not enough stock of ${p.name} (${+p.stock} on hand)`);
    await stock(c, p.id, -qty, 'Issued', j.id, u.name);
    rules.addStockPart(j, p, qty);
  }));
  app.delete('/api/jobs/:id/parts/:i', ...edit(['SA'], async (j, { params, c, u }) => {
    const p = rules.removePartLine(j, params.i);
    if (p.pid) await stock(c, p.pid, p.qty, 'Returned', j.id, u.name);
  }));

  app.post('/api/jobs/:id/status', ...edit([], (j, { body, u, after }) => {
    rules.transition(j, body.to, u);
    if (body.to === 'Closed') after.push(notifier.notifyReady);   // SA has checked labour and parts: the customer is told the vehicle is ready
  }));
  app.post('/api/jobs/:id/labour/:lid/clockin', ...edit(['TECH', 'WS'], async (j, { params, u, c }) => {
    // one running clock per person, so technician hours are never counted twice; lock the person's row so two phones cannot both pass the check
    await c.q('SELECT id FROM app_users WHERE id = ? FOR UPDATE', [u.id]);
    const others = (await c.q("SELECT id, labours FROM jobs WHERE status = 'At workshop' AND id <> ?", [j.id])).map(o => ({ id: o.id, labours: J(o.labours, []) }));
    rules.clockIn(j, params.lid, u, others);
  }));
  app.post('/api/jobs/:id/labour/:lid/clockout', ...edit(['TECH', 'WS'], (j, { params, body, u }) => rules.clockOut(j, params.lid, body.reason, u)));
  app.post('/api/jobs/:id/invoice', ...edit(['SA'], async (j, { body, u, c }) => {
    rules.checkInvoice(j, body.type);
    rules.issueInvoice(j, body.type, cfg.vat, await numberFor(c, 'invoice', 'INV-'), u);
  }));

  // ---- "vehicle ready" messages ----
  const lastNotes = id => db.q('SELECT id, job, cid, channel, to_addr, status, error, `at` FROM notifications WHERE job = ? ORDER BY `at` DESC, id DESC LIMIT 20', [id]);
  app.get('/api/jobs/:id/notifications', auth('SA', 'WS'), wrap(async (q, s) => s.json(await lastNotes(q.params.id))));
  app.post('/api/jobs/:id/notify', auth('SA'), wrap(async (q, s) => {
    const j = jobRow((await db.q('SELECT * FROM jobs WHERE id = ?', [q.params.id]))[0]);
    if (!j) fail(404, 'Job card not found');
    if (!['Closed', 'Invoiced'].includes(j.status)) fail(409, 'The vehicle is not waiting for pick-up');
    const last = (await lastNotes(j.id))[0];
    if (last && Date.now() - new Date(last.at).getTime() < 60e3) fail(429, 'A message was just sent. Wait a minute before sending again.');
    await notifier.notifyReady(j);
    s.json(await lastNotes(j.id));
  }));

  // ---- reports (Addis Ababa days) ----
  app.get('/api/reports/revenue', auth('SA'), wrap(async (q, s) => {
    const [a, b] = range(q.query);
    const [js, cs, vs] = await Promise.all([db.q('SELECT id, cid, vid, labours, parts, inv FROM jobs WHERE inv IS NOT NULL'), db.q('SELECT id, name FROM customers'), db.q('SELECT id, plate FROM vehicles')]);
    s.json({ ...revenueReport(js.map(jobRow), a, b, cfg.vat, Object.fromEntries(cs.map(c => [c.id, c.name])), Object.fromEntries(vs.map(v => [v.id, v.plate]))), from: a, to: b });
  }));
  app.get('/api/reports/hours', auth('SA', 'WS', 'TECH'), wrap(async (q, s) => {
    const [a, b] = range(q.query);
    const js = (await db.q("SELECT id, labours FROM jobs WHERE status <> 'Created'")).map(jobRow);
    s.json({ ...hoursReport(js, a, b, Date.now(), q.u.role === 'TECH' ? q.u.name : null), from: a, to: b });
  }));

  // ---- optional: serve the built React app from this server (single-host deploys, Docker) ----
  if (cfg.frontendDir && existsSync(join(cfg.frontendDir, 'index.html'))) {
    app.use(express.static(cfg.frontendDir, { index: false, setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get(/^\/(?!api\/|health).*/, (q, s) => s.sendFile(join(cfg.frontendDir, 'index.html')));
  }
  app.use('/api', (q, s) => s.status(404).json({ error: 'Not found' }));
  // body-parser errors (bad JSON, body too large) and anything else that escaped
  app.use((e, q, s, next) => { // eslint-disable-line no-unused-vars
    if (e.status && e.status < 500) return s.status(e.status).json({ error: e.type === 'entity.too.large' ? 'Request too large' : 'Bad request' });
    console.error(e); s.status(500).json({ error: 'Server error. Please try again.' });
  });
  return app;
}
