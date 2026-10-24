import express from 'express';
import cors from 'cors';
import { securityHeaders, rateLimit, requestLog } from './security.js';
import { auditMiddleware } from './audit.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fail } from './errors.js';
import { adjustStock, newId, numberFor, J } from './db.js';
import { dayKey, range, hoursReport, revenueReport } from './lib.js';
import { isServiceVisit, nextService, normalizeImport, normalizeService, normalizeTask } from './services.js';
import * as rules from './rules.js';
import { str, qn } from './rules.js';
import * as S from './stock.js';
import { mountStock, recordLost, shortage } from './pos.js';
import { closeRunningClocks } from './workday.js';
import { mountExtras, sniffImage } from './extras.js';
import { verifyTotp } from './totp.js';

const jobRow = r => r && ({ id: r.id, cid: r.cid, vid: r.vid, note: r.note, status: r.status, created: r.created, mileage: r.mileage ?? null, est: r.est || null, payer: r.payer || null, policy_no: r.policy_no || null, mileage_out: r.mileage_out ?? null, claim_no: r.claim_no || null, due_date: r.due_date || null, priority: r.priority || null, price_reqs: J(r.price_reqs, []), services: J(r.services, []), requests: J(r.requests, []), labours: J(r.labours, []), parts: J(r.parts, []), inv: J(r.inv, null), log: J(r.log, []) });
const estRow = r => r && ({ id: r.id, cid: r.cid, vid: r.vid, note: r.note, status: r.status, labours: J(r.labours, []), parts: J(r.parts, []), created: r.created, finalized_at: r.finalized_at, by_name: r.by_name, used_in: r.used_in, pro: r.pro || null, guest_name: r.guest_name || '', guest_phone: r.guest_phone || '', guest_plate: r.guest_plate || '', guest_brand: r.guest_brand || '', guest_model: r.guest_model || '', guest_vin: r.guest_vin || '', guest_eng: r.guest_eng || '' });
const proRow = r => r && ({ id: r.id, cid: r.cid || null, vid: r.vid || null, guest_name: r.guest_name || '', guest_phone: r.guest_phone || '', guest_plate: r.guest_plate || '', guest_brand: r.guest_brand || '', guest_model: r.guest_model || '', guest_vin: r.guest_vin || '', guest_eng: r.guest_eng || '', insurer_id: r.insurer_id || null, policy_no: r.policy_no, estimator_id: r.estimator_id || null, estimator: r.estimator, estimator_role: r.estimator_role, pdate: r.pdate, note: r.note, status: r.status, labours: J(r.labours, []), parts: J(r.parts, []), est: r.est || null, job: r.job || null, claim_no: r.claim_no || '', priority: r.priority || '', due_date: r.due_date || null, terms: r.terms || '', created: r.created, updated: r.updated });
const CUS = 'id, name, phone, city, sub, woreda, house, dob, notify, insurer_id, policy_no, tin, (tg_chat IS NOT NULL) AS tg, created_at';   // never the Telegram chat id or link token
const svcRow = r => r && ({ code: r.code, name: r.name, interval_km: r.interval_km, labours: J(r.labours, []), parts: J(r.parts, []) });
const VEH = 'id, cid, plate, vin, eng, col, brand, model, mileage, next_km, next_type, created_at';
const partRow = r => r && ({ ...r, price: +r.price, stock: +r.stock, reorder: +r.reorder, active: !!r.active });
const sendJson = v => JSON.stringify(v);

export function createApp({ cfg, db, notifier }) {
  const KEY = cfg.jwtSecret, app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders());
  if (cfg.requestLog !== false) app.use(requestLog());
  app.use('/api', rateLimit({ max: cfg.rateLimitPerMin || 1200 }));
  app.use('/api/inventory/import', express.json({ limit: '5mb' }));   // an Excel import sends the whole sheet (1,000+ parts is over 100kb)
  app.use('/api/labour-tasks/import', express.json({ limit: '5mb' }));   // the price book is thousands of rows: far over the usual 100kb
  const bigJson = express.json({ limit: '14mb' });   // creating a job card carries its photos (the browser shrinks each to a few hundred KB)
  app.use('/api/jobs', (q, s, next) => (q.method === 'POST' && (q.path === '/' || q.path === '') ? bigJson(q, s, next) : next()));
  app.use(express.json({ limit: '100kb' }));
  app.use(cors({ origin: cfg.corsOrigin === '*' ? true : cfg.corsOrigin.split(',').map(s => s.trim()) }));

  // async route wrapper: HTTP errors thrown with fail() are answered as they are; anything else is logged and answered as a plain 500
  const wrap = f => (q, s) => f(q, s).catch(async e => {
    if (e.lost) await recordLost(db, e.lost, q.u?.name).catch(err => console.error('lost sale', err.message));   // a refused sale or issue: the part that was not available is written down
    if (Number.isInteger(e.code)) return s.status(e.code).json({ error: e.message });
    if (e.code === 'ER_DUP_ENTRY') return s.status(409).json({ error: 'This record already exists' });
    console.error(q.method, q.path, e);
    s.status(500).json({ error: 'Server error. Please try again.' });
  });
  const revoked = new Map();
  const auth = (...roles) => (q, s, n) => {
    try { q.u = jwt.verify((q.headers.authorization || '').slice(7), KEY); }
    catch { return s.status(401).json({ error: 'Sign in required' }); }
    // the Administrator has unlimited permission: every route is open to him, whatever roles are listed.
    // The Manager can do everything a listed role can; a route listed for 'ADMIN' alone (staff accounts) stays with the Administrator
    // a deleted user, or one whose role or password was just changed, must sign in again: older tokens are refused
    if ((revoked.get(q.u.id) || 0) > q.u.iat * 1000) return s.status(401).json({ error: 'Sign in required' });
    if (q.u.role === 'ADMIN') return n();
    const open = roles.length === 1 && roles[0] === 'ADMIN' ? ['ADMIN'] : ['MGR', ...roles];
    if (roles.length && !open.includes(q.u.role)) return s.status(403).json({ error: 'Your role cannot do this' });
    n();
  };

  // Settings kept in the database. Labour rate per section: the manager sets it on the Labour list screen; a section with no rate uses LABOUR_RATE.
  const getSetting = async (c, k, d) => { const [r] = await c.q('SELECT v FROM settings WHERE k = ?', [k]); return r ? J(r.v, d) : d; };
  const labourRates = async c => ({ default: cfg.labourRate, ...rules.DEFAULT_MAKE_RATES, ...(await getSetting(c, 'labour_rates', {})) });   // Suzuki 350, Toyota 400, Others 450 unless the manager changes them
  const rateMap = r => ({ default: r.default, ...Object.fromEntries(rules.SECTIONS.map(sec => [sec, rules.rateOf(r, sec)])), ...Object.fromEntries(rules.MAKES.map(m => [m, rules.rateOf(r, '', m)])) });
  // A short fingerprint of the stock list. The screens send it back with each refresh, and the list is only sent again when it has changed.
  const partsVersion = async () => {
    const [r] = await db.q("SELECT COUNT(*) AS n, COALESCE(SUM(active),0) AS a, COALESCE(SUM(stock),0) AS s, COALESCE(SUM(price),0) AS pr, COALESCE(SUM(cost),0) AS co, COALESCE(SUM(reorder),0) AS re, COALESCE(SUM(CRC32(CONCAT(code, '|', name, '|', category))),0) AS h FROM inventory");
    return [r.n, r.a, r.s, r.pr, r.co, r.re, r.h].join(':');
  };

  app.use('/api', auditMiddleware(db));   // who did what and when: every change, refused attempt and sign-in
  // ---- health, auth & staff ----
  app.get('/health', async (q, s) => { try { await db.q('SELECT 1'); s.json({ ok: true }); } catch { s.status(503).json({ ok: false }); } });

  const tries = new Map();
  app.post('/api/auth/login', wrap(async (q, s) => {
    const ip = q.ip + '|' + str(q.body.username).toLowerCase(), t = tries.get(ip) || { n: 0, at: Date.now() };   // counted per person, so one wrong typist cannot lock the others out
    if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now(); }
    if (t.n >= 10) fail(429, 'Too many attempts. Try again in 15 minutes.');
    const [u] = await db.q('SELECT * FROM app_users WHERE username = ?', [str(q.body.username).toLowerCase()]);
    if (!u || !(await bcrypt.compare(str(q.body.password, 100), u.pass_hash))) { t.n++; tries.set(ip, t); fail(401, 'Wrong username or password'); }
    // Two-step sign-in: the Manager and the Administrator who switched it on also give the 6-digit code from their authenticator app
    const tfa = ['MGR', 'ADMIN'].includes(u.role) && !!u.totp_on;
    if (tfa) {
      if (!str(q.body.code, 12)) return s.json({ need2fa: true });   // password was right: now ask for the code (the attempt is not cleared yet)
      const step = verifyTotp(u.totp_secret, q.body.code);
      if (step === null || (u.totp_last != null && step <= Number(u.totp_last))) { t.n++; tries.set(ip, t); fail(401, 'Wrong or already used code'); }
      await db.q('UPDATE app_users SET totp_last = ? WHERE id = ?', [step, u.id]);
    }
    tries.delete(ip);
    const user = { id: u.id, name: u.name, role: u.role };
    s.json({ user: { ...user, tfa }, token: jwt.sign(user, KEY, { expiresIn: '12h' }) });
  }));
  // ---- staff accounts ----
  // The Administrator manages every account. The Manager manages his own and all the others, except Administrator accounts.
  const ROLE_LIST = ['SA', 'WS', 'TECH', 'MGR', 'ADMIN'];
  const userRow = r => ({ id: r.id, username: r.username, name: r.name, role: r.role, tfa: !!r.totp_on });
  const mayTouch = (me, target) => me.role === 'ADMIN' || target.role !== 'ADMIN';
  const mayGive = (me, role) => ROLE_LIST.includes(role) && (me.role === 'ADMIN' || role !== 'ADMIN');
  const dup = e => { if (e?.code === 'ER_DUP_ENTRY') fail(409, 'This username is already used'); throw e; };
  app.get('/api/users', auth('MGR'), wrap(async (q, s) => s.json((await db.q('SELECT id, username, name, role, totp_on AS tfa FROM app_users ORDER BY created_at, username')).filter(r => mayTouch(q.u, r)))));
  app.post('/api/users', auth('MGR'), wrap(async (q, s) => {
    const { name, username, password, role } = q.body;
    if (!str(name) || !str(username)) fail(400, 'Name and username are required');
    if (!ROLE_LIST.includes(role)) fail(400, 'Unknown role');
    if (!mayGive(q.u, role)) fail(403, 'Only the Administrator can create an Administrator');
    if (str(password, 100).length < 8) fail(400, 'Password needs at least 8 characters');
    const u = { id: newId(), username: str(username, 60).toLowerCase(), name: str(name, 120), role };
    await db.q('INSERT INTO app_users (id, username, name, role, pass_hash, created_at) VALUES (?,?,?,?,?, UTC_TIMESTAMP(3))', [u.id, u.username, u.name, u.role, await bcrypt.hash(str(password, 100), 10)]).catch(dup);
    s.json(u);
  }));
  // change name, username, role and/or password (only the fields sent)
  app.put('/api/users/:id', auth('MGR'), wrap(async (q, s) => {
    const [t] = await db.q('SELECT * FROM app_users WHERE id = ?', [q.params.id]);
    if (!t) fail(404, 'User not found');
    if (!mayTouch(q.u, t)) fail(403, 'Only the Administrator can change an Administrator account');
    const b = q.body, sets = [], vals = [];
    if (b.name !== undefined) { if (!str(b.name)) fail(400, 'Name is required'); sets.push('name = ?'); vals.push(str(b.name, 120)); }
    if (b.username !== undefined) { if (!str(b.username)) fail(400, 'Username is required'); sets.push('username = ?'); vals.push(str(b.username, 60).toLowerCase()); }
    if (b.role !== undefined && b.role !== t.role) {
      if (!mayGive(q.u, b.role)) fail(403, 'Only the Administrator can make an Administrator');
      if (t.id === q.u.id) fail(400, 'You cannot change your own role');
      if (t.role === 'ADMIN' && (await db.q("SELECT id FROM app_users WHERE role = 'ADMIN' AND id <> ?", [t.id])).length === 0) fail(400, 'There must be at least one Administrator');
      sets.push('role = ?'); vals.push(b.role);
    }
    if (b.password) { if (str(b.password, 100).length < 8) fail(400, 'Password needs at least 8 characters'); sets.push('pass_hash = ?'); vals.push(await bcrypt.hash(str(b.password, 100), 10)); }
    if (b.reset2fa) { sets.push('totp_on = 0', 'totp_secret = NULL', 'totp_last = NULL'); }   // lost phone: he can set up two-step sign-in again
    if (!sets.length) return s.json(userRow(t));
    await db.q(`UPDATE app_users SET ${sets.join(', ')} WHERE id = ?`, [...vals, t.id]).catch(dup);
    if (t.id !== q.u.id) revoked.set(t.id, Date.now());   // his old sign-in stops working: he signs in again with the new details
    s.json(userRow((await db.q('SELECT * FROM app_users WHERE id = ?', [t.id]))[0]));
  }));
  app.delete('/api/users/:id', auth('MGR'), wrap(async (q, s) => {
    const [t] = await db.q('SELECT * FROM app_users WHERE id = ?', [q.params.id]);
    if (!t) fail(404, 'User not found');
    if (t.id === q.u.id) fail(400, 'You cannot delete your own account');
    if (!mayTouch(q.u, t)) fail(403, 'Only the Administrator can delete an Administrator account');
    if (t.role === 'ADMIN' && (await db.q("SELECT id FROM app_users WHERE role = 'ADMIN' AND id <> ?", [t.id])).length === 0) fail(400, 'There must be at least one Administrator');
    await db.q('DELETE FROM app_users WHERE id = ?', [t.id]);
    revoked.set(t.id, Date.now());
    s.json({ ok: true });
  }));

  // The audit trail for the manager: newest first; ?q= finds a person, an action or a record number
  app.get('/api/audit', auth('MGR'), wrap(async (q, s) => {
    const lim = Math.min(Math.max(parseInt(q.query.limit, 10) || 200, 1), 500), t = `%${str(q.query.q, 60).replace(/[%_]/g, '')}%`;
    s.json(await db.q('SELECT id, at, user_name, role, action, ref, status, method, path, ip FROM audit_log WHERE (user_name LIKE ? OR action LIKE ? OR ref LIKE ?)' + (q.u.role === 'ADMIN' ? '' : " AND role <> 'ADMIN' AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM app_users WHERE role = 'ADMIN')) AND user_name NOT IN (SELECT username FROM app_users WHERE role = 'ADMIN') AND user_name NOT IN (SELECT name FROM app_users WHERE role = 'ADMIN')") + ' ORDER BY id DESC LIMIT ?', [t, t, t, lim]));
  }));

  // ---- everything the screens need, in one call ----
  app.get('/api/data', auth(), wrap(async (q, s) => {
    const staff = q.u.role !== 'TECH', mgr = ['ADMIN', 'MGR'].includes(q.u.role);
    const pv = staff ? await partsVersion() : '', sendParts = staff && String(q.query.pv || '') !== pv;
    const [c, v, j, p, e, st, pr, ins, lt, people, techs] = await Promise.all([
      db.q(`SELECT ${CUS} FROM customers ORDER BY created_at, id`),
      db.q(`SELECT ${VEH} FROM vehicles ORDER BY created_at, id`),
      db.q('SELECT * FROM jobs ORDER BY created DESC, id DESC'),
      sendParts ? db.q('SELECT * FROM inventory WHERE active = 1 ORDER BY name') : [],
      staff ? db.q('SELECT * FROM estimates ORDER BY created DESC, id DESC') : [],
      db.q('SELECT * FROM service_types WHERE active = 1 ORDER BY interval_km, code'),
      staff ? db.q('SELECT * FROM proformas ORDER BY created DESC, id DESC') : [],
      staff ? db.q('SELECT id, name, phone, address FROM insurers WHERE active = 1 ORDER BY name') : [],
      staff ? db.q('SELECT id, code, model_grp, task, name, section, hours, price FROM labour_tasks WHERE active = 1 ORDER BY section, task, code, name, model_grp') : [],
      staff ? db.q("SELECT id, name, role FROM app_users WHERE role IN ('SA','WS','MGR','ADMIN') ORDER BY name") : [],
      staff ? db.q("SELECT id, name FROM app_users WHERE role = 'TECH' ORDER BY name") : []]);   // the workshop supervisor picks from these   // estimators: advisors and above, not technicians
    const rates = await labourRates(db);
    s.json({ c: c.map(r => ({ ...r, tg: !!r.tg })), v, j: j.map(jobRow), ...(sendParts ? { p: p.map(r => S.partView(r, mgr)) } : {}), pv, e: e.map(estRow), st: st.map(svcRow), pr: pr.map(proRow), ins, lt: lt.map(t => ({ ...t, hours: +t.hours, price: +t.price })), staff: people, techs,
      cfg: { vat: cfg.vat, markup: S.DEFAULT_MARKUP, labourRate: cfg.labourRate, currency: await getSetting(db, 'currency', 'ETB'), labourRates: rateMap(rates), priceLimitPct: cfg.priceLimitPct, workEnd: cfg.workEnd, tgBot: notifier.botName, sms: notifier.smsReady, garage: cfg.garage } });
  }));

  // ---- customers & vehicles ----
  const cf = b => ({ name: str(b.name), phone: str(b.phone, 30), city: str(b.city), sub: str(b.sub), woreda: str(b.woreda), house: str(b.house), dob: /^\d{4}-\d{2}-\d{2}$/.test(b.dob || '') ? b.dob : null, notify: ['both', 'sms', 'telegram', 'none'].includes(b.notify) ? b.notify : 'both', insurer_id: str(b.insurer_id, 36) || null, policy_no: str(b.policy_no, 60), tin: str(b.tin, 40) });
  const vf = b => ({ plate: str(b.plate, 30), vin: str(b.vin, 40), eng: str(b.eng, 40), col: str(b.col, 30), brand: str(b.brand, 40), model: str(b.model, 60), mileage: rules.cleanKm(b.mileage) });
  const customer = async id => (await db.q(`SELECT ${CUS} FROM customers WHERE id = ?`, [id]))[0];
  const vehicle = async id => (await db.q(`SELECT ${VEH} FROM vehicles WHERE id = ?`, [id]))[0];

  app.post('/api/customers', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.name) || !str(q.body.phone)) fail(400, 'Name and phone are required');
    const f = cf(q.body);
    const id = await db.tx(async c => {
      const id = await numberFor(c, 'customer', 'CUS-');
      await c.q('INSERT INTO customers (id, name, phone, city, sub, woreda, house, dob, notify, insurer_id, policy_no, tin, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [id, f.name, f.phone, f.city, f.sub, f.woreda, f.house, f.dob, f.notify, f.insurer_id, f.policy_no, f.tin]);
      return id;
    });
    const c = await customer(id);
    s.json({ ...c, tg: !!c.tg });
  }));
  app.put('/api/customers/:id', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.name) || !str(q.body.phone)) fail(400, 'Name and phone are required');
    const f = cf(q.body);
    const r = await db.q('UPDATE customers SET name=?, phone=?, city=?, sub=?, woreda=?, house=?, dob=?, notify=?, insurer_id=?, policy_no=?, tin=? WHERE id=?', [f.name, f.phone, f.city, f.sub, f.woreda, f.house, f.dob, f.notify, f.insurer_id, f.policy_no, f.tin, q.params.id]);
    if (!r.affectedRows && !(await customer(q.params.id))) fail(404, 'Customer not found');   // MySQL counts "matched but unchanged" as 0 affected rows
    s.json({ ok: true });
  }));
  // Administrator only. Deleting a job card puts its issued parts back in stock, frees the estimate / proforma that was loaded on it,
  // and removes its payments and notifications.
  const dropJob = async (c, id, by) => {
    const [j] = await c.q('SELECT id, parts FROM jobs WHERE id = ? FOR UPDATE', [id]);
    if (!j) return false;
    for (const p of J(j.parts, [])) if (p.pid && !p.waiting && +p.qty > 0) await adjustStock(c, p.pid, +p.qty, 'Job card deleted', id, by, '');
    await c.q('UPDATE estimates SET used_in = NULL WHERE used_in = ?', [id]);
    // the proforma goes back to Finalized (not left "Converted" with no job card): it can be used again, and its estimate is free again
    await c.q("UPDATE proformas SET status = 'Issued', job = NULL, est = NULL, updated = UTC_TIMESTAMP(3) WHERE job = ?", [id]);
    await c.q("DELETE FROM payments WHERE source = 'job' AND ref = ?", [id]);
    await c.q('DELETE FROM notifications WHERE job = ?', [id]);
    await c.q('DELETE FROM jobs WHERE id = ?', [id]);
    return true;
  };
  app.delete('/api/jobs/:id', auth('ADMIN'), wrap(async (q, s) => {
    await db.tx(async c => { if (!(await dropJob(c, q.params.id, q.u.name))) fail(404, 'Job card not found'); });
    s.json({ ok: true });
  }));
  // Administrator only. Deletes the customer together with his job cards, estimates, proformas and vehicles.
  app.delete('/api/customers/:id', auth('ADMIN'), wrap(async (q, s) => {
    await db.tx(async c => {
      const [cu] = await c.q('SELECT id FROM customers WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!cu) fail(404, 'Customer not found');
      for (const j of await c.q('SELECT id FROM jobs WHERE cid = ?', [q.params.id])) await dropJob(c, j.id, q.u.name);
      await c.q('DELETE FROM estimates WHERE cid = ?', [q.params.id]);
      await c.q('DELETE FROM proformas WHERE cid = ?', [q.params.id]);
      await c.q('DELETE FROM vehicles WHERE cid = ?', [q.params.id]);
      await c.q('DELETE FROM customers WHERE id = ?', [q.params.id]);
    });
    s.json({ ok: true });
  }));
  app.post('/api/customers/:id/vehicles', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.plate)) fail(400, 'Plate is required');
    if (!(await customer(q.params.id))) fail(404, 'Customer not found');
    const f = vf(q.body), id = newId();
    if (f.mileage === null) fail(400, 'Enter the current mileage (km): it is registered with the vehicle');
    await db.q('INSERT INTO vehicles (id, cid, plate, vin, eng, col, brand, model, mileage, created_at) VALUES (?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [id, q.params.id, f.plate, f.vin, f.eng, f.col, f.brand, f.model, f.mileage]);
    s.json(await vehicle(id));
  }));
  app.put('/api/vehicles/:id', auth('SA'), wrap(async (q, s) => {
    if (!str(q.body.plate)) fail(400, 'Plate is required');
    const f = vf(q.body);
    await db.q('UPDATE vehicles SET plate=?, vin=?, eng=?, col=?, brand=?, model=?, mileage = COALESCE(?, mileage) WHERE id=?', [f.plate, f.vin, f.eng, f.col, f.brand, f.model, f.mileage, q.params.id]);
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
  // Items (create, edit, Excel import, bulk price), GRN, point of sale, payments, lost sales and the stock reports: see pos.js. Manager-only where it touches cost or price.
  mountStock({ app, db, cfg, auth, wrap, notifier });
  mountExtras({ app, db, cfg, auth, wrap, getSetting });
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
  // A job card is created WITH photos of the vehicle as it arrives (scratches, dents, broken parts, dashboard warning lights), and work cannot be
  // started (sent to the workshop, or a technician clocking in) while the card has no photo. Cards made before this rule add a photo in the card's Inspection.
  const NEED_PHOTO = 'Add at least one photo of the vehicle first (scratches, dents, broken parts, dashboard warning lights). Work cannot start and a job card cannot be created without it.';
  const cleanPhotos = list => {
    const out = (Array.isArray(list) ? list.slice(0, 8) : []).map(p => {
      const buf = Buffer.from(String(p?.data || ''), 'base64'), mime = sniffImage(buf);
      if (!mime || buf.length > 3 * 1024 * 1024) fail(400, 'Each photo must be a JPEG, PNG or WebP picture under 3 MB');
      return { label: str(p.label, 60), mime, buf };
    });
    if (!out.length) fail(400, NEED_PHOTO);
    return out;
  };
  const requirePhoto = async (c, id) => { const [{ n }] = await c.q('SELECT COUNT(*) AS n FROM job_photos WHERE job_id = ?', [id]); if (!n) fail(409, NEED_PHOTO); };
  app.post('/api/jobs', auth('SA'), wrap(async (q, s) => {
    const { cid, vid } = q.body;
    const [veh] = await db.q('SELECT id, mileage FROM vehicles WHERE id = ? AND cid = ?', [vid, cid]);
    if (!veh) fail(400, 'Vehicle does not belong to this customer');
    const km = rules.checkMileage(rules.cleanKm(q.body.mileage), veh.mileage);
    const photos = cleanPhotos(q.body.photos);   // no photo of the vehicle's condition, no job card
    const estNo = str(q.body.est, 40);   // optional: a finalized estimate chosen while creating the card; its labour and parts come onto the new card at once
    const id = await db.tx(async c => {
      const id = await numberFor(c, 'job', 'TC-');
      await c.q('INSERT INTO jobs (id, cid, vid, note, status, created, labours, parts, inv, `log`, mileage, services, est, requests) VALUES (?,?,?,?,?, UTC_TIMESTAMP(3), ?, ?, NULL, ?, ?, ?, NULL, ?)',
        [id, cid, vid, str(q.body.note, 500), 'Created', '[]', '[]', sendJson([{ s: 'Created', t: Date.now(), by: q.u.name }]), km, '[]', '[]']);
      for (const p of photos) await c.q('INSERT INTO job_photos (id, job_id, label, mime, data, by_name, created) VALUES (?,?,?,?,?,?, UTC_TIMESTAMP(3))', [newId(), id, p.label, p.mime, p.buf, q.u.name]);
      if (estNo) {   // a problem with the estimate (draft, used, another vehicle) undoes the card too, so nothing is half-created
        const [row] = await c.q('SELECT * FROM jobs WHERE id = ? FOR UPDATE', [id]);
        const j = jobRow(row);
        await loadEstimateOn(j, c, q.u, estNo);
        await saveJob(c, j);
      }
      return id;
    });
    s.json(jobRow((await db.q('SELECT * FROM jobs WHERE id = ?', [id]))[0]));
  }));

  // Write the whole job card back (used by every change to a card, and by the card's creation when an estimate is chosen with it)
  const saveJob = (c, j) => c.q('UPDATE jobs SET labours = ?, parts = ?, status = ?, inv = ?, `log` = ?, mileage = ?, services = ?, est = ?, requests = ?, payer = ?, policy_no = ?, mileage_out = ?, claim_no = ?, due_date = ?, priority = ?, price_reqs = ? WHERE id = ?',
    [sendJson(j.labours), sendJson(j.parts), j.status, j.inv ? sendJson(j.inv) : null, sendJson(j.log), j.mileage, sendJson(j.services || []), j.est || null, sendJson(j.requests || []), j.payer || null, j.policy_no || null,
      j.mileage_out ?? null, j.claim_no || null, j.due_date || null, j.priority || null, sendJson(j.price_reqs || []), j.id]);
  // Lock the job row, let fn change it, save it, commit. Everything fn does to stock and counters is in the same transaction,
  // so a failure anywhere undoes all of it and two people changing the same card at once simply take turns.
  // fn(j, ctx) may push callbacks into ctx.after; they run once the change is committed.
  const edit = (roles, fn) => [auth(...roles), wrap(async (q, s) => {
    const { saved, after } = await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM jobs WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Job card not found');
      const j = jobRow(row), after = [];
      await fn(j, { q, c, u: q.u, body: q.body, params: q.params, after });
      await saveJob(c, j);
      return { saved: j, after };
    });
    after.forEach(f => Promise.resolve(f(saved)).catch(e => console.error(e.message)));
    s.json(saved);
  })];

  // Issue one part line on a job card. A line that names a stock part (pid, or a code found in the stock list) leaves stock at the stock price,
  // or at the selling price on the line when it has one; anything else is added as free text and is not tracked.
  const issueLine = async (j, l, c, u, opts = {}) => {
    const qty = rules.partQty(l.qty);
    let p;
    if (l.pid) [p] = await c.q('SELECT * FROM inventory WHERE id = ? AND active = 1 FOR UPDATE', [l.pid]);
    else if (l.code) [p] = await c.q('SELECT * FROM inventory WHERE code = ? AND active = 1 FOR UPDATE', [str(l.code, 40).toUpperCase()]);
    if (!p) return rules.addFreePart(j, { name: l.name || l.code, qty, price: l.price });
    if (+p.stock < qty) {
      if (opts.waiting) return rules.addWaitingPart(j, p, qty, l.price);   // an estimate, proforma or service package loads anyway: this part waits for stock
      throw shortage([{ p, qty }], 'Job card', j.id);                       // refused; the lost sale is recorded once the change has been undone
    }
    await stock(c, p.id, -qty, 'Issued', j.id, u.name);
    rules.addStockPart(j, p, qty, l.price);
  };

  app.post('/api/jobs/:id/labour', ...edit(['SA'], async (j, { body, c }) => rules.addLabour(j, body, await labourRates(c))));
  app.delete('/api/jobs/:id/labour/:lid', ...edit(['SA'], (j, { params }) => rules.removeLabour(j, params.lid)));

  // SA issues parts on the job card. A part picked from the stock list (pid) is taken out of stock; anything else is free text and not tracked.
  app.post('/api/jobs/:id/parts', ...edit(['SA'], async (j, { body, c, u }) => {
    rules.assertPartsOpen(j);
    if (!body.pid) return rules.addFreePart(j, body);
    const qty = rules.partQty(body.qty);
    const [p] = await c.q('SELECT * FROM inventory WHERE id = ? AND active = 1 FOR UPDATE', [body.pid]);
    if (!p) fail(404, 'Part not found in stock list');
    if (+p.stock < qty) {
      if (body.waiting) return rules.addWaitingPart(j, p, qty, body.price);   // the advisor chose to add it as waiting for stock
      throw shortage([{ p, qty }], 'Job card', j.id);
    }
    await stock(c, p.id, -qty, 'Issued', j.id, u.name);
    rules.addStockPart(j, p, qty, body.price);
  }));
  app.delete('/api/jobs/:id/parts/:i', ...edit(['SA'], async (j, { params, c, u }) => {
    const p = rules.removePartLine(j, params.i);
    if (p.pid && !p.waiting) await stock(c, p.pid, p.qty, 'Returned', j.id, u.name);   // a part that was only waiting never left stock
  }));
  // A waiting part arrives: it leaves stock now (refused again while the stock is still short)
  app.post('/api/jobs/:id/parts/:i/receive', ...edit(['SA'], async (j, { params, c, u }) => {
    const line = rules.waitingLine(j, params.i);
    const [p] = await c.q('SELECT * FROM inventory WHERE id = ? AND active = 1 FOR UPDATE', [line.pid]);
    if (!p) fail(404, 'Part not found in stock list');
    if (+p.stock < line.qty) fail(409, `Still not enough stock of ${p.name} (${+p.stock} on hand, ${line.qty} needed)`);
    await stock(c, p.id, -line.qty, 'Issued', j.id, u.name);
    delete line.waiting;
    j.log.push({ s: 'Waiting part received', t: Date.now(), by: u.name, note: `${p.name} x ${line.qty}` });
  }));

  // Selling prices can be changed by the Service Advisor until the invoice is issued. Every change is written in the card's log.
  // A change of more than PRICE_LIMIT_PCT from the list price is a request the manager approves or rejects; the manager's own change is immediate.
  app.put('/api/jobs/:id/parts/:i/price', ...edit(['SA'], (j, { params, body, u }) => rules.submitPartPrice(j, params.i, body.price, u, cfg.priceLimitPct)));
  app.put('/api/jobs/:id/labour/:lid/price', ...edit(['SA'], (j, { params, body, u }) => rules.submitLabourPrice(j, params.lid, body.price, u, cfg.priceLimitPct)));
  app.post('/api/jobs/:id/price-requests/:rid/approve', ...edit(['MGR'], (j, { params, u }) => rules.decidePrice(j, params.rid, true, u)));
  app.post('/api/jobs/:id/price-requests/:rid/reject', ...edit(['MGR'], (j, { params, u }) => rules.decidePrice(j, params.rid, false, u)));

  // Claim number, expected finish date and priority on the card
  app.put('/api/jobs/:id/details', ...edit(['SA'], (j, { body, u }) => rules.setDetails(j, body, u)));

  // Who the invoice is made out to: an insurance company from the list (with the policy no) or the customer. Open until the invoice is issued.
  app.put('/api/jobs/:id/payer', ...edit(['SA'], async (j, { body, c, u }) => {
    let name = null;
    if (body.insurer_id) {
      const [ins] = await c.q('SELECT name FROM insurers WHERE id = ? AND active = 1', [body.insurer_id]);
      if (!ins) fail(400, 'Choose an insurance company from the list');
      name = ins.name;
    }
    rules.setPayer(j, name, body.policy_no, u);
  }));

  // Mileage can be corrected while the card is still being prepared
  app.put('/api/jobs/:id/mileage', ...edit(['SA'], async (j, { body, c }) => {
    if (j.status !== 'Created') fail(409, 'Mileage can only be changed before dispatch');
    const [v] = await c.q('SELECT mileage FROM vehicles WHERE id = ?', [j.vid]);
    j.mileage = rules.checkMileage(rules.cleanKm(body.mileage), v?.mileage);
  }));

  // A service package (Type A / B / C) adds its labour and parts to the card in one step
  app.post('/api/jobs/:id/service', ...edit(['SA'], async (j, { body, c, u }) => {
    const [row] = await c.q('SELECT * FROM service_types WHERE code = ? AND active = 1', [str(body.code, 10).toUpperCase()]);
    if (!row) fail(404, 'Service type not found');
    const t = svcRow(row);
    rules.assertServiceOpen(j, t.code);
    const rates = await labourRates(c);
    for (const l of t.labours) {
      rules.addLabour(j, { desc: `${t.name}: ${l.desc}`, hours: l.hours, price: l.price, section: rules.SECTIONS[0] }, rates);
      j.labours[j.labours.length - 1].svc = t.code;
    }
    for (const p of t.parts) await issueLine(j, { code: p.code, name: p.name, qty: p.qty, price: p.price > 0 ? p.price : undefined }, c, u, { waiting: true });
    j.services = [...(j.services || []), t.code];
    j.log.push({ s: 'Service added', t: Date.now(), by: u.name, note: t.name });
  }));

  // Bring a finalized estimate (by its number) onto a job card: all its labour and parts at the estimate's prices. Used from the card's Labour section
  // and when the card is created with an estimate chosen. An estimate made before any customer was registered takes this card's customer and vehicle.
  // Its proforma (same EST number), if there is one, is closed with it and its insurance details (bill-to, policy, claim, delivery date, priority) move to the card.
  const loadEstimateOn = async (j, c, u, no) => {
    const [row] = await c.q('SELECT * FROM estimates WHERE id = ? FOR UPDATE', [str(no, 40).toUpperCase()]);
    const e = estRow(row);
    rules.checkEstimateImport(j, e);
    const rates = await labourRates(c);
    for (const l of e.labours) {
      rules.addLabour(j, { desc: l.desc, hours: l.hours, price: l.price, section: l.section || rules.EST_SECTION }, rates);
      j.labours[j.labours.length - 1].est = e.id;
    }
    for (const p of e.parts) await issueLine(j, p, c, u, { waiting: true });   // a part that is short waits for stock instead of stopping the whole load
    j.est = e.id;
    const [pr] = await c.q('SELECT * FROM proformas WHERE id = ? FOR UPDATE', [e.id]);
    if (pr && pr.status !== 'Converted') {
      const p = proRow(pr);
      const [ins] = p.insurer_id ? await c.q('SELECT name FROM insurers WHERE id = ?', [p.insurer_id]) : [];
      if (ins) { j.payer = ins.name; j.policy_no = p.policy_no || null; }
      if (p.claim_no) j.claim_no = p.claim_no;
      if (p.due_date) j.due_date = p.due_date;
      if (p.priority) j.priority = p.priority;
      await c.q("UPDATE proformas SET status = 'Converted', est = ?, job = ?, cid = ?, vid = ?, updated = UTC_TIMESTAMP(3) WHERE id = ?", [e.id, j.id, j.cid, j.vid, e.id]);
    }
    await c.q('UPDATE estimates SET used_in = ?, cid = ?, vid = ?, pro = COALESCE(pro, ?) WHERE id = ?', [j.id, j.cid, j.vid, pr ? e.id : null, e.id]);
    j.log.push({ s: 'Estimate loaded', t: Date.now(), by: u.name, note: e.id });
  };
  app.post('/api/jobs/:id/estimate', ...edit(['SA'], (j, { body, c, u }) => loadEstimateOn(j, c, u, body.no)));

  // Additional parts: the workshop asks, only the Service Advisor issues (the stock and the price are the Service Advisor's)
  app.post('/api/jobs/:id/requests', ...edit(['TECH', 'WS'], async (j, { body, c, u }) => {
    let ref = { name: str(body.name, 120) };
    if (body.pid) {
      const [p] = await c.q('SELECT id, code, name FROM inventory WHERE id = ? AND active = 1', [body.pid]);
      if (!p) fail(404, 'Part not found in stock list');
      ref = { pid: p.id, code: p.code, name: p.name };
    }
    rules.requestPart(j, ref, body.qty, u);
  }));
  app.post('/api/jobs/:id/requests/:rid/issue', ...edit(['SA'], async (j, { params, body, c, u }) => {
    const r = rules.openRequest(j, params.rid);
    rules.assertPartsOpen(j);
    await issueLine(j, { pid: body.pid || r.pid, name: r.name, qty: r.qty, price: body.price }, c, u);
    rules.settleRequest(j, r, 'Issued', u);
  }));
  app.post('/api/jobs/:id/requests/:rid/reject', ...edit(['SA'], (j, { params, u }) => rules.settleRequest(j, rules.openRequest(j, params.rid), 'Rejected', u)));

  // The advisor sends the card back to the workshop to add tasks and parts (from "Received by SA" or "Closed", before the invoice)
  app.post('/api/jobs/:id/return', ...edit(['SA'], (j, { u }) => rules.returnToWorkshop(j, u)));

  // Closing the card completes the visit: the vehicle's mileage moves forward and, if a service was done, the next service is suggested
  app.post('/api/jobs/:id/status', ...edit([], async (j, { body, u, after, c }) => {
    if (body.to === 'Dispatched') await requirePhoto(c, j.id);   // sending the card to the workshop starts the work
    if (body.to === 'Closed') rules.setMileageOut(j, body.mileage_out);   // the reading when the vehicle leaves; checked before the status moves
    rules.transition(j, body.to, u);
    if (body.to === 'Closed') {
      const types = await c.q('SELECT code, name, interval_km FROM service_types WHERE active = 1');
      const at = rules.completionKm(j);
      const next = at != null && isServiceVisit(j) ? nextService(at, types) : null;   // any service work counts, counted from the mileage when the vehicle leaves
      await c.q('UPDATE vehicles SET mileage = GREATEST(COALESCE(mileage, 0), ?), next_km = COALESCE(?, next_km), next_type = COALESCE(?, next_type) WHERE id = ?', [at ?? 0, next?.km ?? null, next?.code ?? null, j.vid]);
      // SA has checked labour and parts: the customer is told the vehicle is ready. Only the first time: a card sent back and closed again does not message the customer twice (Send again is still there).
      if (j.log.filter(x => x.s === 'Closed').length === 1) after.push(notifier.notifyReady);
    }
  }));
  // The workshop supervisor chooses the technicians for tasks: body { lids: [labour ids] (none = every open task), tech_ids: [user ids] (none = take the assignment away) }
  app.post('/api/jobs/:id/assign', ...edit(['WS'], async (j, { body, c, u }) => {
    const ids = [...new Set((Array.isArray(body.tech_ids) ? body.tech_ids : []).map(x => str(x, 36)).filter(Boolean))].slice(0, 12);
    const techs = ids.length ? await c.q(`SELECT id, name FROM app_users WHERE role = 'TECH' AND id IN (${ids.map(() => '?').join(',')})`, ids) : [];
    if (techs.length !== ids.length) fail(400, 'Choose technicians from the list');
    const lids = Array.isArray(body.lids) && body.lids.length ? body.lids.map(x => str(x, 40)) : j.labours.filter(l => !l.done).map(l => l.id);
    rules.assignLabour(j, lids, techs, u);
  }));
  app.post('/api/jobs/:id/labour/:lid/clockin', ...edit(['TECH', 'WS'], async (j, { params, u, c }) => {
    // one running clock per person, so technician hours are never counted twice; lock the person's row so two phones cannot both pass the check
    await requirePhoto(c, j.id);   // a technician cannot start labour on a card with no photo of the vehicle
    await c.q('SELECT id FROM app_users WHERE id = ? FOR UPDATE', [u.id]);
    const others = (await c.q("SELECT id, labours FROM jobs WHERE status = 'At workshop' AND id <> ?", [j.id])).map(o => ({ id: o.id, labours: J(o.labours, []) }));
    rules.clockIn(j, params.lid, u, others);
  }));
  app.post('/api/jobs/:id/labour/:lid/clockout', ...edit(['TECH', 'WS'], (j, { params, body, u }) => rules.clockOut(j, params.lid, body.reason, u)));
  app.post('/api/jobs/:id/invoice', ...edit(['SA'], async (j, { body, u, c }) => {
    rules.checkInvoice(j, body.type);
    rules.issueInvoice(j, body.type, cfg.vat, await numberFor(c, 'invoice', 'INV-'), u);
  }));

  // ---- estimates (body & paint): draft, then finalized ----
  const catalogue = async c => new Map((await c.q('SELECT * FROM inventory WHERE active = 1')).map(r => { const p = partRow(r); return [p.id, p]; }));
  app.post('/api/estimates', auth('SA'), wrap(async (q, s) => {
    // Without a customer: a draft estimation with just a number. The customer is added later, when the job card is created.
    const { cid, vid } = q.body;
    if ((cid || vid) && !(await db.q('SELECT id FROM vehicles WHERE id = ? AND cid = ?', [vid, cid])).length) fail(400, 'Vehicle does not belong to this customer');
    const id = await db.tx(async c => {
      const id = await numberFor(c, 'estimate', 'EST-');
      const g = (k, n) => (cid ? '' : str(q.body[k], n));   // walk-in details are kept only while there is no registered customer
      await c.q('INSERT INTO estimates (id, cid, vid, note, status, labours, parts, created, guest_name, guest_phone, guest_plate, guest_brand, guest_model, guest_vin, guest_eng) VALUES (?,?,?,?,?,?,?, UTC_TIMESTAMP(3),?,?,?,?,?,?,?)', [id, cid || null, vid || null, str(q.body.note, 500), 'Draft', '[]', '[]', g('guest_name', 120), g('guest_phone', 30), g('guest_plate', 30), g('guest_brand', 40), g('guest_model', 60), g('guest_vin', 40), g('guest_eng', 40)]);
      return id;
    });
    s.json(estRow((await db.q('SELECT * FROM estimates WHERE id = ?', [id]))[0]));
  }));
  const estEdit = fn => [auth('SA'), wrap(async (q, s) => {
    const saved = await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM estimates WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Estimate not found');
      const e = estRow(row);
      await fn(e, { c, body: q.body, u: q.u });
      await c.q('UPDATE estimates SET note = ?, status = ?, labours = ?, parts = ?, finalized_at = ?, by_name = ? WHERE id = ?',
        [e.note, e.status, sendJson(e.labours), sendJson(e.parts), e.finalized_at || null, e.by_name || null, e.id]);
      return e;
    });
    s.json(saved);
  })];
  app.put('/api/estimates/:id', ...estEdit(async (e, { c, body }) => { rules.assertDraft(e); Object.assign(e, rules.normalizeEstimate(body, await labourRates(c), await catalogue(c))); }));
  // An estimate and the proforma made from it share one EST number and are one document: finalizing the estimate finalizes (issues) its proforma
  // with the estimate's lines, and moving the estimate back to draft moves the proforma back too. A customer is not needed: it is added when the job card is made.
  app.post('/api/estimates/:id/finalize', ...estEdit(async (e, { c, u }) => {
    rules.checkFinalize(e);
    e.status = 'Finalized'; e.finalized_at = new Date(); e.by_name = u.name;
    const [pr] = await c.q('SELECT status, estimator FROM proformas WHERE id = ? FOR UPDATE', [e.id]);
    if (pr && pr.status !== 'Converted') {
      await c.q("UPDATE proformas SET labours = ?, parts = ?, note = ?, status = 'Issued', updated = UTC_TIMESTAMP(3) WHERE id = ?", [sendJson(e.labours), sendJson(e.parts), e.note, e.id]);
      await c.q('UPDATE estimates SET pro = ? WHERE id = ?', [e.id, e.id]);
    }
  }));
  app.post('/api/estimates/:id/draft', auth('MGR'), ...estEdit(async (e, { c }) => {
    rules.checkReopen(e); e.status = 'Draft'; e.finalized_at = null; e.by_name = null;
    await c.q("UPDATE proformas SET status = 'Draft', updated = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'Issued'", [e.id]);
  }).slice(1));   // only the Manager and the Administrator can send a finalized estimate back to draft
  app.delete('/api/estimates/:id', auth('SA'), wrap(async (q, s) => {
    await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM estimates WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Estimate not found');
      if (row.used_in) fail(409, `This estimate is loaded on job card ${row.used_in} and cannot be deleted`);
      // the Service Advisor deletes drafts; the Administrator can also delete a finalized estimate
      if (row.status !== 'Draft' && q.u.role !== 'ADMIN') fail(409, 'Only a draft estimate can be deleted');
      await c.q('DELETE FROM estimates WHERE id = ?', [q.params.id]);
    });
    s.json({ ok: true });
  }));

  // ---- insurance companies and the labour task list ----
  const insForm = b => { const name = str(b.name, 160); if (!name) fail(400, 'Enter the insurance company name'); return { name, phone: str(b.phone, 30), address: str(b.address, 200), active: b.active === false || b.active === 0 ? 0 : 1 }; };
  app.post('/api/insurers', auth('MGR'), wrap(async (q, s) => {
    const f = insForm(q.body), id = newId();
    if ((await db.q('SELECT id FROM insurers WHERE name = ?', [f.name])).length) fail(409, 'This insurance company is already registered');
    await db.q('INSERT INTO insurers (id, name, phone, address, active) VALUES (?,?,?,?,1)', [id, f.name, f.phone, f.address]);
    s.json({ id, name: f.name, phone: f.phone, address: f.address });
  }));
  // Excel import: rows of { name, phone, address }. A company already registered (same name) is skipped; nothing is changed or deleted.
  app.post('/api/insurers/import', auth('MGR'), wrap(async (q, s) => {
    const rows = Array.isArray(q.body.rows) ? q.body.rows.slice(0, 2000) : [];
    if (!rows.length) fail(400, 'The file has no insurance companies');
    let added = 0, skipped = 0;
    for (const r of rows) {
      const name = str(r?.name, 160), phone = str(r?.phone, 30), address = str(r?.address, 200);
      if (!name) continue;
      const res = await db.q('INSERT IGNORE INTO insurers (id, name, phone, address, active) VALUES (?,?,?,?,1)', [newId(), name, phone, address]);
      if (res.affectedRows) added++; else skipped++;
    }
    s.json({ added, skipped });
  }));
  app.put('/api/insurers/:id', auth('MGR'), wrap(async (q, s) => {
    const f = insForm(q.body);
    if ((await db.q('SELECT id FROM insurers WHERE name = ? AND id <> ?', [f.name, q.params.id])).length) fail(409, 'This insurance company is already registered');
    const r = await db.q('UPDATE insurers SET name = ?, phone = ?, address = ?, active = ? WHERE id = ?', [f.name, f.phone, f.address, f.active, q.params.id]);
    if (!r.affectedRows) fail(404, 'Insurance company not found');
    s.json({ id: q.params.id, name: f.name, phone: f.phone, address: f.address });
  }));

  app.post('/api/labour-tasks', auth('MGR'), wrap(async (q, s) => {
    const f = normalizeTask(q.body, rules.SECTIONS), id = newId();
    if ((await db.q('SELECT id FROM labour_tasks WHERE code = ? AND model_grp = ? AND task = ? AND name = ? AND section = ?', [f.code, f.model_grp, f.task, f.name, f.section])).length) fail(409, 'This task is already in the list');
    await db.q('INSERT INTO labour_tasks (id, code, model_grp, task, name, section, hours, price, active) VALUES (?,?,?,?,?,?,?,?,1)', [id, f.code, f.model_grp, f.task, f.name, f.section, f.hours, f.price]);
    s.json({ id, ...f });
  }));
  // Import the garage's Excel price book (the browser reads all its sheets and sends the rows). Only BP- and ME- codes are taken:
  // Labour Code, Description, Model Grp and Hours. The cost is not imported: it is always hours x the labour rate in the system.
  // A line already there (same code and model group) gets its description and hours updated. Nothing is deleted.
  app.post('/api/labour-tasks/import', auth('MGR'), wrap(async (q, s) => {
    const { lines, skipped, ignored } = normalizeImport(q.body.rows, rules.SECTIONS);
    let added = 0, updated = 0;
    await db.tx(async c => {
      for (const l of lines) {
        const r = await c.q('UPDATE labour_tasks SET name = ?, section = ?, hours = ?, price = 0, active = 1 WHERE code = ? AND model_grp = ?', [l.name, l.section, l.hours, l.code, l.model_grp]);
        if (r.affectedRows) updated++;
        else { await c.q('INSERT INTO labour_tasks (id, code, model_grp, task, name, section, hours, price, active) VALUES (?,?,?,?,?,?,?,0,1)', [newId(), l.code, l.model_grp, '', l.name, l.section, l.hours]); added++; }
      }
    });
    s.json({ added, updated, skipped, ignored });
  }));
  app.put('/api/labour-tasks/:id', auth('MGR'), wrap(async (q, s) => {
    const f = normalizeTask(q.body, rules.SECTIONS);
    if ((await db.q('SELECT id FROM labour_tasks WHERE code = ? AND model_grp = ? AND task = ? AND name = ? AND section = ? AND id <> ?', [f.code, f.model_grp, f.task, f.name, f.section, q.params.id])).length) fail(409, 'This task is already in the list');
    const r = await db.q('UPDATE labour_tasks SET code = ?, model_grp = ?, task = ?, name = ?, section = ?, hours = ?, price = ?, active = ? WHERE id = ?', [f.code, f.model_grp, f.task, f.name, f.section, f.hours, f.price, f.active, q.params.id]);
    if (!r.affectedRows) fail(404, 'Task not found');
    s.json({ id: q.params.id, ...f });
  }));

  // ---- first-hand (insurance) proforma: draft, issued, then turned into a job card + estimate ----
  app.post('/api/proformas', auth('SA'), wrap(async (q, s) => {
    // A proforma is made only from an estimation, draft or finalized, by its EST number: it takes that number, its labour, parts and notes; the insurance company is added.
    // A walk-in's name, phone and vehicle are written on the proforma itself and are registered when the job card is created.
    if (q.body.est) {
      const estId = str(q.body.est, 40).toUpperCase();
      const [er] = await db.q('SELECT * FROM estimates WHERE id = ?', [estId]);
      if (!er) fail(404, `Estimate ${estId} not found`);
      if (er.used_in) fail(409, `${estId} is already loaded on job card ${er.used_in}`);
      if ((await db.q('SELECT id FROM proformas WHERE id = ?', [estId])).length) fail(409, `${estId} already has a proforma: open it in Proformas`);
      const insId = str(q.body.insurer_id, 36) || null;
      if (insId && !(await db.q('SELECT id FROM insurers WHERE id = ?', [insId])).length) fail(400, 'Choose an insurance company from the list');
      const e = estRow(er);
      const [cu0 = {}] = e.cid ? await db.q('SELECT insurer_id, policy_no FROM customers WHERE id = ?', [e.cid]) : [];
      await db.q('INSERT INTO proformas (id, cid, vid, guest_name, guest_phone, guest_plate, guest_brand, guest_model, insurer_id, policy_no, estimator_id, estimator, estimator_role, pdate, note, status, labours, parts, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
        [estId, e.cid || null, e.vid || null, '', '', '', '', '', insId || cu0.insurer_id || null, insId ? '' : cu0.policy_no || '', q.u.id, q.u.name, q.u.role, dayKey(Date.now()), e.note, e.status === 'Finalized' ? 'Issued' : 'Draft', sendJson(e.labours), sendJson(e.parts)]);   // a finalized estimate gives a finalized proforma; a draft one is finalized together with its estimate
      await db.q('UPDATE estimates SET pro = ? WHERE id = ?', [estId, estId]);
      return s.json(proRow((await db.q('SELECT * FROM proformas WHERE id = ?', [estId]))[0]));
    }
    // A proforma never gets a number of its own: EST numbers belong to estimations, and a proforma is made from one (draft or finalized)
    fail(400, 'Choose an estimate: a proforma is made from an estimate number (draft or finalized).');
  }));
  const proEdit = fn => [auth('SA'), wrap(async (q, s) => {
    const saved = await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM proformas WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Proforma not found');
      const p = proRow(row);
      await fn(p, { c, body: q.body, u: q.u });
      await c.q('UPDATE proformas SET guest_name = ?, guest_phone = ?, guest_plate = ?, guest_brand = ?, guest_model = ?, guest_vin = ?, guest_eng = ?, insurer_id = ?, policy_no = ?, estimator_id = ?, estimator = ?, estimator_role = ?, pdate = ?, note = ?, status = ?, labours = ?, parts = ?, claim_no = ?, priority = ?, due_date = ?, terms = ?, updated = UTC_TIMESTAMP(3) WHERE id = ?',
        [p.guest_name || '', p.guest_phone || '', p.guest_plate || '', p.guest_brand || '', p.guest_model || '', p.guest_vin || '', p.guest_eng || '', p.insurer_id, p.policy_no, p.estimator_id, p.estimator, p.estimator_role, p.pdate, p.note, p.status, sendJson(p.labours), sendJson(p.parts), p.claim_no || '', p.priority || '', p.due_date || null, p.terms || '', p.id]);
      return proRow((await c.q('SELECT * FROM proformas WHERE id = ?', [p.id]))[0]);
    });
    s.json(saved);
  })];
  // Saving is what the screen's auto-save calls every moment: header (insurance, estimator, date, notes) and all lines at once
  app.put('/api/proformas/:id', ...proEdit(async (p, { c, body }) => {
    rules.assertProformaOpen(p);
    Object.assign(p, rules.normalizeEstimate(body, await labourRates(c), await catalogue(c)));
    if (body.insurer_id !== undefined) {
      p.insurer_id = str(body.insurer_id, 36) || null;
      if (p.insurer_id && !(await c.q('SELECT id FROM insurers WHERE id = ?', [p.insurer_id])).length) fail(400, 'Choose an insurance company from the list');
    }
    if (!p.cid) for (const [k, n] of [['guest_name', 120], ['guest_phone', 30], ['guest_plate', 30], ['guest_brand', 40], ['guest_model', 60], ['guest_vin', 40], ['guest_eng', 40]]) if (body[k] !== undefined) p[k] = str(body[k], n);
    if (body.policy_no !== undefined) p.policy_no = str(body.policy_no, 60);
    if (rules.dateOk(body.pdate)) p.pdate = body.pdate;
    if (body.claim_no !== undefined) p.claim_no = str(body.claim_no, 60);
    if (body.priority !== undefined) p.priority = rules.PRIORITIES.includes(body.priority) && body.priority !== 'Normal' ? body.priority : '';
    if (body.due_date !== undefined) p.due_date = rules.dateOk(body.due_date) ? body.due_date : null;
    if (body.terms !== undefined) p.terms = str(body.terms, 1000);
    if (body.estimator_id && body.estimator_id !== p.estimator_id) {
      const [u] = await c.q("SELECT id, name, role FROM app_users WHERE id = ? AND role IN ('SA','WS','MGR','ADMIN')", [body.estimator_id]);
      if (!u) fail(400, 'Choose the estimator from the list (a technician cannot be the estimator)');
      Object.assign(p, { estimator_id: u.id, estimator: u.name, estimator_role: u.role });
    }
    // once finalized, the proforma and its estimate stay one document: a change to the proforma's lines goes to the estimate too (until it is on a job card)
    if (p.status === 'Issued') await c.q("UPDATE estimates SET note = ?, labours = ?, parts = ? WHERE id = ? AND status = 'Finalized' AND used_in IS NULL", [p.note, sendJson(p.labours), sendJson(p.parts), p.id]);
  }));
  // Finalizing (issuing) the proforma finalizes its estimate, the same EST number: the estimate is made now when only the proforma existed,
  // so it can be fetched by number when the job card is created. A walk-in's estimate has no customer or vehicle until then.
  app.post('/api/proformas/:id/issue', ...proEdit(async (p, { c, u }) => {
    rules.checkProformaIssue(p); p.status = 'Issued';
    if (!String(p.id).startsWith('EST-')) return;
    const [er] = await c.q('SELECT used_in FROM estimates WHERE id = ? FOR UPDATE', [p.id]);
    if (!er) await c.q('INSERT INTO estimates (id, cid, vid, note, status, labours, parts, created, finalized_at, by_name, pro) VALUES (?,?,?,?,?,?,?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), ?, ?)',
      [p.id, p.cid, p.vid, p.note, 'Finalized', sendJson(p.labours), sendJson(p.parts), p.estimator || u.name, p.id]);
    else if (!er.used_in) await c.q("UPDATE estimates SET cid = COALESCE(cid, ?), vid = COALESCE(vid, ?), note = ?, status = 'Finalized', labours = ?, parts = ?, finalized_at = COALESCE(finalized_at, UTC_TIMESTAMP(3)), by_name = COALESCE(by_name, ?), pro = ? WHERE id = ?",
      [p.cid, p.vid, p.note, sendJson(p.labours), sendJson(p.parts), p.estimator || u.name, p.id, p.id]);
  }));
  app.delete('/api/proformas/:id', auth('SA'), wrap(async (q, s) => {
    await db.tx(async c => {
      const [row] = await c.q('SELECT status FROM proformas WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Proforma not found');
      if (row.status === 'Converted') fail(409, 'This proforma already became a job card');
      if (row.status === 'Issued' && q.u.role !== 'ADMIN') fail(403, 'Only the Administrator can delete a finalized proforma');   // a draft can be deleted by the advisor; a finalized one only by the Administrator
      await c.q('DELETE FROM proformas WHERE id = ?', [q.params.id]);
      await c.q('UPDATE estimates SET pro = NULL WHERE pro = ?', [q.params.id]);   // its estimate stays (finalized or draft) and can get a new proforma
    });
    s.json({ ok: true });
  }));
  // Creating the job card: the proforma becomes a finalized estimate, which is loaded on the new card (stock parts leave stock now)
  app.post('/api/proformas/:id/convert', auth('SA'), wrap(async (q, s) => {
    const jobId = await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM proformas WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Proforma not found');
      const p = proRow(row);
      rules.checkConvert(p);
      const [lnk] = await c.q('SELECT used_in FROM estimates WHERE id = ? FOR UPDATE', [p.id]);
      if (lnk?.used_in) fail(409, `${p.id} is already loaded on job card ${lnk.used_in}`);   // its estimate was put on a job card directly: never load it twice
      // He came back and agreed: only now is a walk-in registered (or linked to a customer who already exists), and the proforma moves to him
      if (!p.cid) {
        const km0 = rules.cleanKm(q.body.mileage);
        if (q.body.cid) {
          const [cu] = await c.q('SELECT id FROM customers WHERE id = ?', [q.body.cid]);
          if (!cu) fail(400, 'Customer not found');
          if (q.body.vid) {
            if (!(await c.q('SELECT id FROM vehicles WHERE id = ? AND cid = ?', [q.body.vid, cu.id])).length) fail(400, 'Vehicle does not belong to this customer');
            p.vid = q.body.vid;
          } else {
            if (!p.guest_plate) fail(400, 'Write the plate number to register the vehicle');
            if (km0 === null) fail(400, 'Enter the current mileage (km): it is registered with the vehicle');
            p.vid = newId();
            await c.q('INSERT INTO vehicles (id, cid, plate, vin, eng, col, brand, model, mileage, created_at) VALUES (?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [p.vid, cu.id, p.guest_plate, p.guest_vin || '', p.guest_eng || '', '', p.guest_brand, p.guest_model, km0]);
          }
          p.cid = cu.id;
        } else {
          if (!p.guest_name || !p.guest_phone) fail(400, 'Write the customer name and phone to register him');
          if (!p.guest_plate) fail(400, 'Write the plate number to register the vehicle');
          if (km0 === null) fail(400, 'Enter the current mileage (km): it is registered with the vehicle');
          p.cid = await numberFor(c, 'customer', 'CUS-'); p.vid = newId();
          const [ins0] = p.insurer_id ? await c.q('SELECT id FROM insurers WHERE id = ?', [p.insurer_id]) : [];
          await c.q('INSERT INTO customers (id, name, phone, city, sub, woreda, house, dob, notify, insurer_id, policy_no, tin, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [p.cid, p.guest_name, p.guest_phone, '', '', '', '', null, 'both', ins0 ? ins0.id : null, ins0 ? p.policy_no || '' : '', '']);
          await c.q('INSERT INTO vehicles (id, cid, plate, vin, eng, col, brand, model, mileage, created_at) VALUES (?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [p.vid, p.cid, p.guest_plate, p.guest_vin || '', p.guest_eng || '', '', p.guest_brand, p.guest_model, km0]);
        }
        await c.q('UPDATE proformas SET cid = ?, vid = ? WHERE id = ?', [p.cid, p.vid, p.id]);
      }
      const [veh] = await c.q('SELECT mileage FROM vehicles WHERE id = ? AND cid = ?', [p.vid, p.cid]);
      const km = rules.checkMileage(rules.cleanKm(q.body.mileage) ?? veh?.mileage ?? null, veh?.mileage);   // no reading typed: the vehicle's registered mileage is used
      const rates = await labourRates(c);
      const jid = await numberFor(c, 'job', 'TC-'), eid = String(p.id).startsWith('EST-') ? p.id : await numberFor(c, 'estimate', 'EST-');   // the proforma's own EST number becomes the estimate's
      const [ins] = p.insurer_id ? await c.q('SELECT name FROM insurers WHERE id = ?', [p.insurer_id]) : [];
      const note = [ins && `Insurance: ${ins.name}${p.policy_no ? ` (policy ${p.policy_no})` : ''}`, p.note].filter(Boolean).join(' · ').slice(0, 500);
      const j = { id: jid, vid: p.vid, status: 'Created', labours: [], parts: [], inv: null, services: [], requests: [], mileage: km, est: eid,
        log: [{ s: 'Created', t: Date.now(), by: q.u.name, note: `from ${p.id}` }] };
      for (const l of p.labours) {
        rules.addLabour(j, { desc: l.desc, hours: l.hours, price: l.price, section: l.section || rules.EST_SECTION }, rates);
        j.labours[j.labours.length - 1].est = eid;
      }
      for (const pt of p.parts) await issueLine(j, pt, c, q.u, { waiting: true });
      // a proforma made from a draft estimate finalizes that same estimate (customer and vehicle are added to it now)
      if ((await c.q('SELECT id FROM estimates WHERE id = ? FOR UPDATE', [eid])).length) await c.q("UPDATE estimates SET cid = ?, vid = ?, note = ?, status = 'Finalized', labours = ?, parts = ?, finalized_at = UTC_TIMESTAMP(3), by_name = ?, used_in = ?, pro = ? WHERE id = ?",
        [p.cid, p.vid, p.note, sendJson(p.labours), sendJson(p.parts), p.estimator || q.u.name, jid, p.id, eid]);
      else await c.q('INSERT INTO estimates (id, cid, vid, note, status, labours, parts, created, finalized_at, by_name, used_in, pro) VALUES (?,?,?,?,?,?,?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), ?, ?, ?)',
        [eid, p.cid, p.vid, p.note, 'Finalized', sendJson(p.labours), sendJson(p.parts), p.estimator || q.u.name, jid, p.id]);
      await c.q('INSERT INTO jobs (id, cid, vid, note, status, created, labours, parts, inv, `log`, mileage, services, est, requests, payer, policy_no, claim_no, due_date, priority) VALUES (?,?,?,?,?, UTC_TIMESTAMP(3), ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [jid, p.cid, p.vid, note, 'Created', sendJson(j.labours), sendJson(j.parts), sendJson(j.log), km, '[]', eid, '[]', ins ? ins.name : null, ins ? p.policy_no || null : null, p.claim_no || null, p.due_date || null, p.priority || null]);   // the invoice is made out to the insurance company
      await c.q("UPDATE proformas SET status = 'Converted', est = ?, job = ?, updated = UTC_TIMESTAMP(3) WHERE id = ?", [eid, jid, p.id]);
      return jid;
    });
    s.json({ ok: true, job: jobId });
  }));

  // ---- labour rate per section (manager) ----
  app.put('/api/settings/labour-rates', auth('MGR'), wrap(async (q, s) => {
    const out = {};
    for (const sec of [...rules.SECTIONS, ...rules.MAKES]) {
      const v = q.body.rates?.[sec];
      if (v === undefined || v === null || String(v).trim() === '') continue;           // empty = use the standard rate
      const n = qn(v);
      if (!(n >= 0 && n <= 100000)) fail(400, `Enter the hourly rate for ${sec} as a number`);
      out[sec] = n;
    }
    await db.q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', ['labour_rates', sendJson(out)]);
    s.json(rateMap(await labourRates(db)));
  }));

  // ---- end of the working day: every running clock is closed (also done by itself at WORK_END when that is set) ----
  app.post('/api/workshop/end-of-day', auth('WS'), wrap(async (q, s) => s.json({ closed: await closeRunningClocks(db, Date.now(), null, q.u.name) })));

  // ---- search the stock by typing: part number or any words of the description (a technician sees names only, no prices or quantities) ----
  app.get('/api/parts/search', auth(), wrap(async (q, s) => {
    const sql = S.partSearchSql(q.query.q);
    if (!sql) return s.json([]);
    const limit = Math.min(30, Math.max(1, parseInt(q.query.limit, 10) || 8));
    const rows = await db.q(`SELECT id, code, name, price, stock, reorder FROM inventory WHERE active = 1 AND ${sql.where} LIMIT 200`, sql.params);
    s.json(S.rankParts(rows, q.query.q, limit).map(p => S.searchView(p, q.u.role === 'TECH')));
  }));

  // ---- service packages (Type A / B / C) ----
  app.put('/api/service-types/:code', auth('MGR'), wrap(async (q, s) => {
    const f = normalizeService(q.body);
    if (!(await db.q('SELECT code FROM service_types WHERE code = ?', [q.params.code])).length) fail(404, 'Service type not found');
    await db.q('UPDATE service_types SET name = ?, interval_km = ?, labours = ?, parts = ? WHERE code = ?', [f.name, f.interval_km, sendJson(f.labours), sendJson(f.parts), q.params.code]);
    s.json(svcRow((await db.q('SELECT * FROM service_types WHERE code = ?', [q.params.code]))[0]));
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
  app.get('/api/reports/revenue', auth('MGR'), wrap(async (q, s) => {
    const [a, b] = range(q.query);
    const [js, cs, vs] = await Promise.all([db.q('SELECT id, cid, vid, labours, parts, inv FROM jobs WHERE inv IS NOT NULL'), db.q('SELECT id, name FROM customers'), db.q('SELECT id, plate FROM vehicles')]);
    s.json({ ...revenueReport(js.map(jobRow), a, b, cfg.vat, Object.fromEntries(cs.map(c => [c.id, c.name])), Object.fromEntries(vs.map(v => [v.id, v.plate]))), from: a, to: b });
  }));
  app.get('/api/reports/hours', auth('WS', 'TECH'), wrap(async (q, s) => {
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
