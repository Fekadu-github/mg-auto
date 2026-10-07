import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { totals, range, e164, hoursReport, revenueReport } from './lib.js';

const {
  SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET: S, CORS_ORIGIN = '*', ADMIN_USER, ADMIN_PASS, PORT = 3000, VAT_RATE = '0.15',
  TELEGRAM_BOT_TOKEN: TG, TELEGRAM_WEBHOOK_SECRET, PUBLIC_API_URL, RENDER_EXTERNAL_URL,
  SMS_API_URL = 'https://api.afromessage.com/api/send', SMS_API_KEY, SMS_IDENTIFIER, SMS_SENDER, SMS_COUNTRY_CODE = '251',
  GARAGE_PHONE = '0980766566',
  READY_MESSAGE = 'MG Auto: Dear {name}, your vehicle {plate} is ready (job card {jc}). Please come to collect it. Questions? Call {phone}.'
} = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !S) throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_KEY and JWT_SECRET');
const VAT = +VAT_RATE >= 0 && +VAT_RATE < 1 ? +VAT_RATE : 0.15;
const TGS = TELEGRAM_WEBHOOK_SECRET || createHmac('sha256', S).update('telegram-webhook').digest('hex');
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()) }));

const fail = (code, msg) => { throw Object.assign(new Error(msg), { code }); };
const ok = r => { if (r.error) fail(r.error.code === '23505' ? 409 : 500, r.error.message); return r.data; };
const wrap = f => (q, s) => f(q, s).catch(e => s.status(Number.isInteger(e.code) ? e.code : 500).json({ error: e.message }));
const auth = (...roles) => (q, s, n) => {
  try { q.u = jwt.verify((q.headers.authorization || '').slice(7), S); }
  catch { return s.status(401).json({ error: 'Sign in required' }); }
  if (roles.length && !['ADMIN', ...roles].includes(q.u.role)) return s.status(403).json({ error: 'Your role cannot do this' });
  n();
};
const no = async (k, p) => p + String(ok(await sb.rpc('next_no', { p_k: k }))).padStart(4, '0');
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const qn = v => Math.round(+v * 100) / 100;
const isAdminOr = (q, ...r) => ['ADMIN', ...r].includes(q.u.role);

// ---- Telegram & SMS (used when a vehicle is ready) ----
const tgApi = async (m, body) => {
  const r = await fetch(`https://api.telegram.org/bot${TG}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10000) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.description || 'Telegram error ' + r.status);
  return d.result;
};
// AfroMessage-style gateway: POST json with a Bearer key. Check SMS_API_URL and field names against your provider's docs.
const sendSms = async (to, message) => {
  const body = { to, message, ...(SMS_IDENTIFIER && { from: SMS_IDENTIFIER }), ...(SMS_SENDER && { sender: SMS_SENDER }) };
  const r = await fetch(SMS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SMS_API_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (d.acknowledge && d.acknowledge !== 'success')) throw new Error(`SMS gateway ${r.status}: ${JSON.stringify(d.response ?? d).slice(0, 160)}`);
};
let tgBot = null;
if (TG) {
  try {
    tgBot = (await tgApi('getMe')).username;
    const base = (PUBLIC_API_URL || RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
    if (base) await tgApi('setWebhook', { url: base + '/api/telegram/webhook', secret_token: TGS, allowed_updates: ['message'] });
    else console.warn('Telegram: set PUBLIC_API_URL so the webhook can be registered');
  } catch (e) { console.error('Telegram setup failed:', e.message); }
}

// Tell the customer the vehicle is ready. Never throws: every outcome is written to `notifications` so the SA can see it.
async function notifyReady(j) {
  try {
    const c = ok(await sb.from('customers').select('*').eq('id', j.cid).single()), v = ok(await sb.from('vehicles').select('plate').eq('id', j.vid).single());
    const text = READY_MESSAGE.replace(/\{(\w+)\}/g, (_, k) => ({ name: c.name, plate: v.plate, jc: j.id, phone: GARAGE_PHONE }[k] ?? ''));
    const pref = c.notify || 'both';
    const log = (channel, to, status, error) => sb.from('notifications').insert({ job: j.id, cid: c.id, channel, to_addr: to || '', status, error: error || null });
    if (pref === 'none') return void await log('-', '', 'skipped', 'Customer asked not to be notified');
    if (pref !== 'telegram') {
      const to = e164(c.phone, SMS_COUNTRY_CODE);
      if (!SMS_API_KEY) await log('sms', c.phone, 'skipped', 'SMS gateway is not set up');
      else if (!to) await log('sms', c.phone, 'failed', 'Phone number is not a valid mobile number');
      else try { await sendSms(to, text); await log('sms', to, 'sent'); } catch (e) { await log('sms', to, 'failed', e.message); }
    }
    if (pref !== 'sms') {
      if (!tgBot) await log('telegram', '', 'skipped', 'Telegram bot is not set up');
      else if (!c.tg_chat) await log('telegram', '', 'skipped', 'Customer has not linked Telegram');
      else try { await tgApi('sendMessage', { chat_id: c.tg_chat, text }); await log('telegram', 'linked chat', 'sent'); } catch (e) { await log('telegram', 'linked chat', 'failed', e.message); }
    }
  } catch (e) { console.error('notifyReady', j.id, e.message); }
}

// ---- auth & staff ----
const tries = new Map();
app.get('/health', (q, s) => s.json({ ok: true }));
app.post('/api/auth/login', wrap(async (q, s) => {
  const ip = q.ip, t = tries.get(ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now(); }
  if (t.n >= 10) fail(429, 'Too many attempts. Try again in 15 minutes.');
  const u = ok(await sb.from('app_users').select('*').eq('username', str(q.body.username).toLowerCase()).maybeSingle());
  if (!u || !(await bcrypt.compare(str(q.body.password, 100), u.pass_hash))) { t.n++; tries.set(ip, t); fail(401, 'Wrong username or password'); }
  const user = { id: u.id, name: u.name, role: u.role };
  s.json({ user, token: jwt.sign(user, S, { expiresIn: '12h' }) });
}));
app.get('/api/users', auth('ADMIN'), wrap(async (q, s) =>
  s.json(ok(await sb.from('app_users').select('id,username,name,role').order('created_at')))));
app.post('/api/users', auth('ADMIN'), wrap(async (q, s) => {
  const { name, username, password, role } = q.body;
  if (!str(name) || !str(username)) fail(400, 'Name and username are required');
  if (!['SA', 'WS', 'TECH', 'ADMIN'].includes(role)) fail(400, 'Unknown role');
  if (str(password, 100).length < 8) fail(400, 'Password needs at least 8 characters');
  s.json(ok(await sb.from('app_users').insert({ name: str(name), username: str(username).toLowerCase(), role, pass_hash: await bcrypt.hash(password, 10) }).select('id,username,name,role').single()));
}));

// ---- customers & vehicles ----
app.get('/api/data', auth(), wrap(async (q, s) => {
  const staff = q.u.role !== 'TECH';
  const [c, v, j, p] = await Promise.all([
    sb.from('customers').select('*').order('created_at'),
    sb.from('vehicles').select('*').order('created_at'),
    sb.from('jobs').select('*').order('created', { ascending: false }),
    staff ? sb.from('inventory').select('*').eq('active', true).order('name') : { data: [] }]);
  // never send the Telegram chat id or link token to the browser
  s.json({ c: ok(c).map(({ tg_chat, tg_token, ...r }) => ({ ...r, tg: !!tg_chat })), v: ok(v), j: ok(j), p: ok(p), cfg: { vat: VAT, tgBot, sms: !!SMS_API_KEY } });
}));
const cf = b => ({ name: str(b.name), phone: str(b.phone, 30), city: str(b.city), sub: str(b.sub), woreda: str(b.woreda), house: str(b.house), dob: b.dob || null, notify: ['both', 'sms', 'telegram', 'none'].includes(b.notify) ? b.notify : 'both' });
const vf = b => ({ plate: str(b.plate, 30), vin: str(b.vin, 40), eng: str(b.eng, 40), col: str(b.col, 30), model: str(b.model, 60) });
app.post('/api/customers', auth('SA'), wrap(async (q, s) => {
  if (!str(q.body.name) || !str(q.body.phone)) fail(400, 'Name and phone are required');
  s.json(ok(await sb.from('customers').insert({ id: await no('customer', 'C-'), ...cf(q.body) }).select().single()));
}));
app.post('/api/customers/:id/vehicles', auth('SA'), wrap(async (q, s) => {
  if (!str(q.body.plate)) fail(400, 'Plate is required');
  s.json(ok(await sb.from('vehicles').insert({ cid: q.params.id, ...vf(q.body) }).select().single()));
}));
app.put('/api/customers/:id', auth('SA'), wrap(async (q, s) => {
  if (!str(q.body.name) || !str(q.body.phone)) fail(400, 'Name and phone are required');
  if (!ok(await sb.from('customers').update(cf(q.body)).eq('id', q.params.id).select('id').maybeSingle())) fail(404, 'Customer not found');
  s.json({ ok: true });
}));
app.put('/api/vehicles/:id', auth('SA'), wrap(async (q, s) => {
  if (!str(q.body.plate)) fail(400, 'Plate is required');
  s.json(ok(await sb.from('vehicles').update(vf(q.body)).eq('id', q.params.id).select().single()));
}));

// ---- Telegram linking: the customer taps a one-time link, the bot learns their chat id ----
app.post('/api/customers/:id/telegram-link', auth('SA'), wrap(async (q, s) => {
  if (!tgBot) fail(409, 'The Telegram bot is not set up on the server');
  const token = randomBytes(12).toString('base64url');
  const c = ok(await sb.from('customers').update({ tg_token: token }).eq('id', q.params.id).select('id').maybeSingle());
  if (!c) fail(404, 'Customer not found');
  s.json({ url: `https://t.me/${tgBot}?start=${token}` });
}));
app.post('/api/telegram/webhook', (q, s) => {
  if (!TG || q.get('x-telegram-bot-api-secret-token') !== TGS) return s.sendStatus(403);
  s.sendStatus(200);
  (async () => {
    const m = q.body?.message, chat = m?.chat?.id;
    if (!chat || m.chat.type !== 'private') return;
    const [cmd, arg] = str(m.text, 100).split(/\s+/), say = t => tgApi('sendMessage', { chat_id: chat, text: t });
    if (cmd === '/start' && /^[\w-]{8,40}$/.test(arg || '')) {
      const c = ok(await sb.from('customers').select('id,name').eq('tg_token', arg).maybeSingle());
      if (!c) return say('This link is no longer valid. Please ask the service advisor at MG Auto for a new one.');
      ok(await sb.from('customers').update({ tg_chat: String(chat), tg_token: null }).eq('id', c.id));
      return say(`Hello ${c.name}! You will get a message here when your vehicle is ready. Send /stop to stop these messages.`);
    }
    if (cmd === '/stop') { ok(await sb.from('customers').update({ tg_chat: null }).eq('tg_chat', String(chat))); return say('Done. You will no longer get messages here.'); }
    return say('Welcome to MG Auto. To get a message when your vehicle is ready, open the link the service advisor gave you.');
  })().catch(e => console.error('telegram webhook:', e.message));
});

// ---- parts inventory ----
// Stock only ever changes through the adjust_stock SQL function: atomic, never below zero, and every change is written to stock_moves.
const stock = async (id, d, reason, job, by, note) => {
  const r = await sb.rpc('adjust_stock', { p_id: id, p_delta: d, p_reason: reason, p_job: job || null, p_by: by, p_note: note || null });
  if (r.error) { const miss = /INSUFFICIENT/.test(r.error.message); fail(miss ? (d > 0 ? 404 : 409) : 500, miss ? (d > 0 ? 'Part not found' : 'Not enough stock') : r.error.message); }
  return +r.data;
};
app.post('/api/inventory', auth('SA'), wrap(async (q, s) => {
  const f = { code: str(q.body.code, 40).toUpperCase(), name: str(q.body.name, 120), price: Math.max(0, +q.body.price || 0), reorder: Math.max(0, +q.body.reorder || 0) };
  if (!f.code || !f.name) fail(400, 'Part code and name are required');
  if (ok(await sb.from('inventory').select('id').eq('code', f.code).maybeSingle())) fail(409, 'A part with this code already exists');
  const p = ok(await sb.from('inventory').insert(f).select().single()), open = qn(q.body.stock);
  if (open > 0) p.stock = await stock(p.id, open, 'Opening stock', null, q.u.name);
  s.json(p);
}));
app.put('/api/inventory/:id', auth('SA'), wrap(async (q, s) => {
  const f = {};
  if (q.body.name !== undefined) { f.name = str(q.body.name, 120); if (!f.name) fail(400, 'Name is required'); }
  if (q.body.price !== undefined) f.price = Math.max(0, +q.body.price || 0);
  if (q.body.reorder !== undefined) f.reorder = Math.max(0, +q.body.reorder || 0);
  if (q.body.active !== undefined) f.active = !!q.body.active;
  const p = ok(await sb.from('inventory').update(f).eq('id', q.params.id).select().maybeSingle());
  if (!p) fail(404, 'Part not found');
  s.json(p);
}));
app.post('/api/inventory/:id/receive', auth('SA'), wrap(async (q, s) => {
  const n = qn(q.body.qty);
  if (!(n > 0)) fail(400, 'Enter a quantity above zero');
  s.json({ stock: await stock(q.params.id, n, 'Received', null, q.u.name, str(q.body.note, 200)) });
}));
app.post('/api/inventory/:id/adjust', auth('SA'), wrap(async (q, s) => {
  const cnt = qn(q.body.count);
  if (!(cnt >= 0)) fail(400, 'Enter the counted quantity');
  if (!str(q.body.note)) fail(400, 'Say why (for example: stock count, damaged)');
  const p = ok(await sb.from('inventory').select('id,stock').eq('id', q.params.id).maybeSingle());
  if (!p) fail(404, 'Part not found');
  const d = qn(cnt - p.stock);
  s.json({ stock: d ? await stock(p.id, d, 'Adjusted', null, q.u.name, str(q.body.note, 200)) : +p.stock });
}));
app.get('/api/inventory/:id/moves', auth('SA', 'WS'), wrap(async (q, s) =>
  s.json(ok(await sb.from('stock_moves').select('*').eq('part_id', q.params.id).order('at', { ascending: false }).limit(100)))));

// ---- job cards ----
app.post('/api/jobs', auth('SA'), wrap(async (q, s) => {
  const { cid, vid, note } = q.body;
  const v = ok(await sb.from('vehicles').select('id').eq('id', vid).eq('cid', cid).maybeSingle());
  if (!v) fail(400, 'Vehicle does not belong to this customer');
  s.json(ok(await sb.from('jobs').insert({ id: await no('job', 'JC-'), cid, vid, note: str(note, 500), status: 'Created' }).select().single()));
}));

const SECTIONS = ['Regular Service', 'Mechanical Repairs', 'Body & Paints'];
const BEFORE_CLOSE = ['Created', 'Dispatched', 'At workshop', 'Work done', 'Back with SA'];
const REASONS = ['Completed', 'Lunch', 'End of work day', 'Supervisor command'];
const FLOW = { Dispatched: ['Created', ['SA']], 'At workshop': ['Dispatched', ['WS']], 'Work done': ['At workshop', ['WS']], 'Back with SA': ['Work done', ['SA']], Closed: ['Back with SA', ['SA']], Delivered: ['Invoiced', ['SA']] };
const active = l => l.logs.find(x => !x.out);

// Load the job, let fn change it, save it. The save only succeeds if nobody else saved the job in between (ver),
// otherwise fn's side effects are undone and everything is retried on fresh data. Two technicians clocking in/out
// on the same job card at the same moment can no longer overwrite each other.
// fn may return an async undo() for side effects (stock) and may push callbacks into q.after, run once the save is done.
const edit = (roles, fn) => [auth(...roles), wrap(async (q, s) => {
  for (let n = 0; n < 4; n++) {
    q.after = [];
    const j = ok(await sb.from('jobs').select('*').eq('id', q.params.id).maybeSingle());
    if (!j) fail(404, 'Job card not found');
    const undo = await fn(j, q);
    const r = ok(await sb.from('jobs').update({ labours: j.labours, parts: j.parts, status: j.status, inv: j.inv, log: j.log, ver: j.ver + 1 }).eq('id', j.id).eq('ver', j.ver).select());
    if (r.length) { q.after.forEach(f => f(r[0]).catch(e => console.error(e.message))); return s.json(r[0]); }
    if (undo) await undo().catch(e => console.error('undo failed', e.message));
  }
  fail(409, 'The job card was changed by someone else at the same time. Please try again.');
})];
const lab = (j, id) => j.labours.find(l => l.id === id) || fail(404, 'Labour not found');

app.post('/api/jobs/:id/labour', ...edit(['SA'], (j, q) => {
  if (j.status !== 'Created') fail(409, 'Labour can only be added before dispatch');
  if (!str(q.body.desc)) fail(400, 'Describe the work');
  j.labours.push({ id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), desc: str(q.body.desc), section: SECTIONS.includes(q.body.section) ? q.body.section : SECTIONS[0], price: Math.max(0, +q.body.price || 0), done: false, logs: [] });
}));
app.delete('/api/jobs/:id/labour/:lid', ...edit(['SA'], (j, q) => {
  if (j.status !== 'Created') fail(409, 'Labour can only be removed before dispatch');
  j.labours = j.labours.filter(l => l.id !== q.params.lid);
}));
// SA issues parts on the job card. A part picked from the stock list (pid) is taken out of stock; anything else is free text and not tracked.
app.post('/api/jobs/:id/parts', ...edit(['SA'], async (j, q) => {
  if (!BEFORE_CLOSE.includes(j.status)) fail(409, 'Job card is closed');
  const qty = Math.max(0.01, qn(q.body.qty) || 1);
  if (!q.body.pid) {
    if (!str(q.body.name)) fail(400, 'Part name is required');
    j.parts.push({ name: str(q.body.name), qty, price: Math.max(0, +q.body.price || 0) });
    return;
  }
  const p = ok(await sb.from('inventory').select('*').eq('id', q.body.pid).eq('active', true).maybeSingle());
  if (!p) fail(404, 'Part not found in stock list');
  try { await stock(p.id, -qty, 'Issued', j.id, q.u.name); }
  catch (e) { if (e.code === 409) fail(409, `Not enough stock of ${p.name} (${p.stock} on hand)`); throw e; }
  j.parts.push({ pid: p.id, code: p.code, name: p.name, qty, price: +p.price });
  return () => stock(p.id, qty, 'Issue cancelled', j.id, q.u.name, 'save conflict');
}));
app.delete('/api/jobs/:id/parts/:i', ...edit(['SA'], async (j, q) => {
  if (!BEFORE_CLOSE.includes(j.status)) fail(409, 'Job card is closed');
  const i = +q.params.i;
  if (!Number.isInteger(i) || !j.parts[i]) fail(404, 'Part line not found');
  const [p] = j.parts.splice(i, 1);
  if (!p.pid) return;
  await stock(p.pid, p.qty, 'Returned', j.id, q.u.name);
  return () => stock(p.pid, -p.qty, 'Return cancelled', j.id, q.u.name, 'save conflict');
}));
app.post('/api/jobs/:id/status', ...edit([], (j, q) => {
  const to = q.body.to, f = FLOW[to];
  if (!f || j.status !== f[0]) fail(409, `Job card is "${j.status}", cannot move to "${to}"`);
  if (!isAdminOr(q, ...f[1])) fail(403, 'Your role cannot do this step');
  if (to === 'Dispatched' && !j.labours.length) fail(400, 'Add at least one labour first');
  if (to === 'Work done' && j.labours.some(l => !l.done)) fail(400, 'Every labour must be completed first');
  j.status = to; j.log.push({ s: to, t: Date.now(), by: q.u.name });
  if (to === 'Closed') q.after.push(notifyReady);          // SA has checked labour and parts: the customer is told the vehicle is ready
}));
app.post('/api/jobs/:id/labour/:lid/clockin', ...edit(['TECH', 'WS'], async (j, q) => {
  if (j.status !== 'At workshop') fail(409, 'Job card is not in the workshop');
  const l = lab(j, q.params.lid);
  if (l.done) fail(409, 'This labour is completed and cannot be clocked in again');
  if (active(l)) fail(409, 'Someone is already clocked in on this labour');
  // one running clock per person, so technician hours are never counted twice
  for (const o of ok(await sb.from('jobs').select('id,labours').eq('status', 'At workshop')))
    for (const x of (o.id === j.id ? j.labours : o.labours)) { const a = active(x); if (a && a.tech === q.u.name) fail(409, `You are still clocked in on ${o.id} (${x.desc}). Clock out there first.`); }
  l.logs.push({ tech: q.u.name, in: Date.now() });
}));
app.post('/api/jobs/:id/labour/:lid/clockout', ...edit(['TECH', 'WS'], (j, q) => {
  const reason = q.body.reason, l = lab(j, q.params.lid), a = active(l);
  if (!REASONS.includes(reason)) fail(400, 'Choose a clock-out reason');
  if (!a) fail(409, 'Nobody is clocked in on this labour');
  if (reason === 'Supervisor command' && !isAdminOr(q, 'WS')) fail(403, 'Only the supervisor can do this');
  if (q.u.role === 'TECH' && a.tech !== q.u.name) fail(403, 'This clock belongs to another technician');
  a.out = Date.now(); a.reason = reason;
  if (reason === 'Completed') l.done = true;
}));
app.post('/api/jobs/:id/invoice', ...edit(['SA'], async (j, q) => {
  const p = { Proforma: 'PF-', Cash: 'CI-', Credit: 'CR-' }[q.body.type];
  if (!p) fail(400, 'Choose Proforma, Cash or Credit');
  if (!['Closed', 'Invoiced'].includes(j.status)) fail(409, 'Close the job card before invoicing');
  if (q.body.type !== 'Proforma' && j.inv) fail(409, `Already invoiced (${j.inv.no})`);
  // amounts are frozen on the document, so a later VAT change never alters an issued invoice or old reports
  const doc = { type: q.body.type, no: await no('invoice', p), date: Date.now(), totals: totals(j, VAT) };
  if (doc.type === 'Proforma') { j.log.push({ s: 'Proforma printed', t: Date.now(), by: q.u.name, doc }); return; } // a quote: status unchanged
  j.inv = doc; j.status = 'Invoiced'; j.log.push({ s: 'Invoiced', t: Date.now(), by: q.u.name, doc });
}));

// ---- "vehicle ready" messages ----
const lastNotes = async id => ok(await sb.from('notifications').select('*').eq('job', id).order('at', { ascending: false }).limit(20));
app.get('/api/jobs/:id/notifications', auth('SA', 'WS'), wrap(async (q, s) => s.json(await lastNotes(q.params.id))));
app.post('/api/jobs/:id/notify', auth('SA'), wrap(async (q, s) => {
  const j = ok(await sb.from('jobs').select('*').eq('id', q.params.id).maybeSingle());
  if (!j) fail(404, 'Job card not found');
  if (!['Closed', 'Invoiced'].includes(j.status)) fail(409, 'The vehicle is not waiting for pick-up');
  const last = (await lastNotes(j.id))[0];
  if (last && Date.now() - Date.parse(last.at) < 60e3) fail(429, 'A message was just sent. Wait a minute before sending again.');
  await notifyReady(j);
  s.json(await lastNotes(j.id));
}));

// ---- reports (Addis Ababa days) ----
app.get('/api/reports/revenue', auth('SA'), wrap(async (q, s) => {
  const [a, b] = range(q.query);
  const [js, cs, vs] = await Promise.all([sb.from('jobs').select('id,cid,vid,labours,parts,inv').not('inv', 'is', null), sb.from('customers').select('id,name'), sb.from('vehicles').select('id,plate')]);
  s.json({ ...revenueReport(ok(js), a, b, VAT, Object.fromEntries(ok(cs).map(c => [c.id, c.name])), Object.fromEntries(ok(vs).map(v => [v.id, v.plate]))), from: a, to: b });
}));
app.get('/api/reports/hours', auth('SA', 'WS', 'TECH'), wrap(async (q, s) => {
  const [a, b] = range(q.query);
  s.json({ ...hoursReport(ok(await sb.from('jobs').select('id,labours').neq('status', 'Created')), a, b, Date.now(), q.u.role === 'TECH' ? q.u.name : null), from: a, to: b });
}));

// first start: create the admin account from env vars
const { count } = await sb.from('app_users').select('id', { count: 'exact', head: true });
if (!count && ADMIN_USER && ADMIN_PASS) {
  await sb.from('app_users').insert({ username: ADMIN_USER.toLowerCase(), name: 'Administrator', role: 'ADMIN', pass_hash: await bcrypt.hash(ADMIN_PASS, 10) });
  console.log('Admin account created');
}
app.listen(PORT, () => console.log('MG Auto API on ' + PORT));
