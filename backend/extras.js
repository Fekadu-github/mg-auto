// Two-step sign-in, customer approval by link, currency/language, reception inspection and photos.
// Mounted by app.js; everything here uses the same auth(), wrap() and database as the rest of the API.
import bcrypt from 'bcryptjs';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { fail } from './errors.js';
import { newId, J } from './db.js';
import { str } from './rules.js';
import { newSecret, otpauthUri, verifyTotp } from './totp.js';

export const INSPECTION_ITEMS = ['body_front', 'body_rear', 'body_left', 'body_right', 'windscreen', 'lights', 'tyres', 'spare', 'mirrors', 'wipers', 'dash_lights', 'interior', 'audio', 'tools', 'fluids'];
const STATES = ['ok', 'attn', 'na'], FUEL = ['E', '1/4', '1/2', '3/4', 'F'];
const MAX_PHOTOS = 20, APPROVAL_DAYS = 14;
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// What the file's first bytes say it is (a photo upload is accepted only if it really is a picture)
export const sniffImage = b => (b?.length > 12 && b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b?.length > 12 && b.slice(1, 4).toString() === 'PNG' ? 'image/png' : b?.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null);

export function approvalTotals(labours, parts, vat) {
  const l = r2((labours || []).reduce((s, x) => s + (+x.price || 0), 0)), p = r2((parts || []).reduce((s, x) => s + (+x.qty || 0) * (+x.price || 0), 0)), sub = r2(l + p), v = r2(sub * vat);
  return { labour: l, parts: p, sub, vat: v, total: r2(sub + v), rate: vat };
}

export function mountExtras({ app, db, cfg, auth, wrap, getSetting }) {
  // ---------- two-step sign-in (manager and administrator) ----------
  app.get('/api/auth/2fa', auth('MGR'), wrap(async (q, s) => { const [u] = await db.q('SELECT totp_on FROM app_users WHERE id = ?', [q.u.id]); s.json({ on: !!u?.totp_on }); }));
  app.post('/api/auth/2fa/setup', auth('MGR'), wrap(async (q, s) => {
    const [u] = await db.q('SELECT username, totp_on FROM app_users WHERE id = ?', [q.u.id]);
    if (!u) fail(404, 'User not found');
    if (u.totp_on) fail(409, 'Two-step sign-in is already on. Switch it off first to set it up again.');
    const secret = newSecret();
    await db.q('UPDATE app_users SET totp_secret = ?, totp_on = 0, totp_last = NULL WHERE id = ?', [secret, q.u.id]);
    s.json({ secret, uri: otpauthUri(secret, u.username) });
  }));
  app.post('/api/auth/2fa/enable', auth('MGR'), wrap(async (q, s) => {
    const [u] = await db.q('SELECT totp_secret FROM app_users WHERE id = ?', [q.u.id]);
    const step = verifyTotp(u?.totp_secret, q.body.code);
    if (step === null) fail(400, 'That code is not right. Check the code in your authenticator app and try again.');
    await db.q('UPDATE app_users SET totp_on = 1, totp_last = ? WHERE id = ?', [step, q.u.id]);
    s.json({ ok: true });
  }));
  app.post('/api/auth/2fa/disable', auth('MGR'), wrap(async (q, s) => {
    const [u] = await db.q('SELECT pass_hash, totp_secret, totp_on FROM app_users WHERE id = ?', [q.u.id]);
    if (!u?.totp_on) return s.json({ ok: true });
    if (!(await bcrypt.compare(str(q.body.password, 100), u.pass_hash))) fail(401, 'Wrong password');
    if (verifyTotp(u.totp_secret, q.body.code) === null) fail(400, 'That code is not right');
    await db.q('UPDATE app_users SET totp_on = 0, totp_secret = NULL, totp_last = NULL WHERE id = ?', [q.u.id]);
    s.json({ ok: true });
  }));

  // ---------- currency (manager) ----------
  app.put('/api/settings/currency', auth('MGR'), wrap(async (q, s) => {
    const code = str(q.body.code, 8).toUpperCase().replace(/[^A-Z$€£]/g, '');
    if (code.length < 1) fail(400, 'Write the currency code, for example ETB or USD');
    await db.q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', ['currency', JSON.stringify(code)]);
    s.json({ currency: code });
  }));

  // ---------- customer approval of an estimate or proforma by link ----------
  const snapshot = async (kind, ref) => {
    const [row] = await db.q(kind === 'proforma' ? 'SELECT * FROM proformas WHERE id = ?' : 'SELECT * FROM estimates WHERE id = ?', [ref]);
    if (!row) fail(404, kind === 'proforma' ? 'Proforma not found' : 'Estimate not found');
    const [cu] = row.cid ? await db.q('SELECT name, phone FROM customers WHERE id = ?', [row.cid]) : [];
    const [ve] = row.vid ? await db.q('SELECT plate, brand, model FROM vehicles WHERE id = ?', [row.vid]) : [];
    const labours = J(row.labours, []), parts = J(row.parts, []);
    if (!labours.length && !parts.length) fail(400, 'Add labour or parts first');
    return {
      no: row.id, date: row.pdate || row.finalized_at || row.created, note: row.note || '',
      customer: cu?.name || row.guest_name || '', plate: ve?.plate || row.guest_plate || '', vehicle: [ve?.brand || row.guest_brand, ve?.model || row.guest_model].filter(Boolean).join(' '),
      labours: labours.map(l => ({ desc: l.desc, hours: l.hours ?? null, price: +l.price || 0 })), parts: parts.map(p => ({ name: p.name, code: p.code || '', qty: +p.qty || 0, price: +p.price || 0 })),
      totals: approvalTotals(labours, parts, cfg.vat), terms: row.terms || ''
    };
  };
  const apRow = r => ({ token: r.token, kind: r.kind, ref: r.ref, status: r.status, created: r.created, expires: r.expires, decided_at: r.decided_at, decided_name: r.decided_name, decided_note: r.decided_note });
  app.get('/api/approvals', auth('SA'), wrap(async (q, s) => {
    const kind = q.query.kind === 'proforma' ? 'proforma' : 'estimate';
    s.json((await db.q('SELECT * FROM approvals WHERE kind = ? AND ref = ? ORDER BY created DESC LIMIT 5', [kind, str(q.query.ref, 40)])).map(apRow));
  }));
  // Make a link: what the customer sees is frozen now, so he approves exactly what was shown. An older open link is withdrawn.
  app.post('/api/approvals', auth('SA'), wrap(async (q, s) => {
    const kind = q.body.kind === 'proforma' ? 'proforma' : 'estimate', ref = str(q.body.ref, 40), snap = await snapshot(kind, ref), token = randomBytes(24).toString('hex');
    await db.tx(async c => {
      await c.q("UPDATE approvals SET status = 'Revoked' WHERE kind = ? AND ref = ? AND status = 'Pending'", [kind, ref]);
      await c.q('INSERT INTO approvals (token, kind, ref, status, snapshot, by_name, created, expires) VALUES (?,?,?,?,?,?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY))', [token, kind, ref, 'Pending', JSON.stringify(snap), q.u.name, APPROVAL_DAYS]);
    });
    s.json(apRow((await db.q('SELECT * FROM approvals WHERE token = ?', [token]))[0]));
  }));
  app.delete('/api/approvals/:token', auth('SA'), wrap(async (q, s) => {
    await db.q("UPDATE approvals SET status = 'Revoked' WHERE token = ? AND status = 'Pending'", [q.params.token]);
    s.json({ ok: true });
  }));
  // The customer's side: no sign-in, the long random token is the key. Only what was frozen on the link is shown.
  const open = async token => {
    const [r] = await db.q('SELECT * FROM approvals WHERE token = ?', [str(token, 64)]);
    if (!r) fail(404, 'This link is not valid');
    return r;
  };
  app.get('/api/public/approval/:token', wrap(async (q, s) => {
    const r = await open(q.params.token), expired = r.status === 'Pending' && new Date(r.expires) < new Date();
    s.json({ status: expired ? 'Expired' : r.status, kind: r.kind, doc: J(r.snapshot, {}), decided_at: r.decided_at, decided_name: r.decided_name, garage: cfg.garage, currency: await getSetting(db, 'currency', 'ETB') });
  }));
  app.post('/api/public/approval/:token', wrap(async (q, s) => {
    const r = await open(q.params.token), decision = q.body.decision === 'approve' ? 'Approved' : q.body.decision === 'decline' ? 'Declined' : null;
    if (!decision) fail(400, 'Choose approve or decline');
    if (r.status !== 'Pending') fail(409, r.status === 'Revoked' ? 'This link was replaced by a newer one. Ask the garage for the new link.' : 'A decision was already given on this link.');
    if (new Date(r.expires) < new Date()) fail(410, 'This link has expired. Ask the garage for a new one.');
    const name = str(q.body.name, 120);
    if (!name) fail(400, 'Write your name');
    await db.q('UPDATE approvals SET status = ?, decided_at = UTC_TIMESTAMP(3), decided_name = ?, decided_note = ?, decided_ip = ? WHERE token = ? AND status = ?', [decision, name, str(q.body.note, 300), q.ip || '', r.token, 'Pending']);
    s.json({ ok: true, status: decision });
  }));

  // ---------- reception inspection checklist and photos ----------
  const jobExists = async id => { if (!(await db.q('SELECT id FROM jobs WHERE id = ?', [id])).length) fail(404, 'Job card not found'); };
  const photoRow = r => ({ id: r.id, label: r.label, by_name: r.by_name, created: r.created });
  app.get('/api/jobs/:id/inspection', auth(), wrap(async (q, s) => {
    await jobExists(q.params.id);
    const [ins] = await db.q('SELECT data, by_name, updated FROM job_inspections WHERE job_id = ?', [q.params.id]);
    const photos = await db.q('SELECT id, label, by_name, created FROM job_photos WHERE job_id = ? ORDER BY created, id', [q.params.id]);
    s.json({ inspection: ins ? { ...J(ins.data, {}), by_name: ins.by_name, updated: ins.updated } : null, photos: photos.map(photoRow), items: INSPECTION_ITEMS });
  }));
  app.put('/api/jobs/:id/inspection', auth('SA', 'WS'), wrap(async (q, s) => {
    await jobExists(q.params.id);
    const items = {};
    for (const k of INSPECTION_ITEMS) if (STATES.includes(q.body.items?.[k])) items[k] = q.body.items[k];
    const data = { items, fuel: FUEL.includes(q.body.fuel) ? q.body.fuel : '', damage: str(q.body.damage, 500), valuables: str(q.body.valuables, 300), keys: str(q.body.keys, 100), notes: str(q.body.notes, 500) };
    await db.q('INSERT INTO job_inspections (job_id, data, by_name, updated) VALUES (?,?,?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE data = VALUES(data), by_name = VALUES(by_name), updated = UTC_TIMESTAMP(3)', [q.params.id, JSON.stringify(data), q.u.name]);
    s.json({ ok: true });
  }));
  // The browser shrinks the picture first (about 1280 px), so a photo is a few hundred KB; the limit here is a safety net
  app.post('/api/jobs/:id/photos', auth('SA', 'WS'), express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '4mb' }), wrap(async (q, s) => {
    await jobExists(q.params.id);
    const mime = sniffImage(q.body);
    if (!Buffer.isBuffer(q.body) || !mime) fail(400, 'Send a JPEG, PNG or WebP picture');
    const [{ n }] = await db.q('SELECT COUNT(*) AS n FROM job_photos WHERE job_id = ?', [q.params.id]);
    if (n >= MAX_PHOTOS) fail(409, `A job card can hold ${MAX_PHOTOS} photos`);
    const id = newId();
    await db.q('INSERT INTO job_photos (id, job_id, label, mime, data, by_name, created) VALUES (?,?,?,?,?,?, UTC_TIMESTAMP(3))', [id, q.params.id, str(q.query.label, 60), mime, q.body, q.u.name]);
    s.json(photoRow((await db.q('SELECT id, label, by_name, created FROM job_photos WHERE id = ?', [id]))[0]));
  }));
  app.get('/api/photos/:id', auth(), wrap(async (q, s) => {
    const [p] = await db.q('SELECT mime, data FROM job_photos WHERE id = ?', [q.params.id]);
    if (!p) fail(404, 'Photo not found');
    s.set({ 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=86400' }).send(p.data);
  }));
  app.delete('/api/photos/:id', auth('SA'), wrap(async (q, s) => { await db.q('DELETE FROM job_photos WHERE id = ?', [q.params.id]); s.json({ ok: true }); }));
}
