// Manager dashboard numbers, stock insight and the service-due reminders. Mounted by mountStock (pos.js).
//   GET  /api/insight/manager       cash collected today, unpaid credit invoices by age, 7 and 30 day sales   (manager)
//   GET  /api/insight/stock         parts with no movement, top sellers, "what to buy" from lost sales         (manager)
//   GET  /api/service-due/reminders last reminder sent per vehicle                                            (sales advisor+)
//   POST /api/service-due/remind    { vid, force? } sends the Telegram (or SMS) reminder for one vehicle       (sales advisor+)
// Days are Addis Ababa days (UTC+3), like the rest of the app.
import { fail } from './errors.js';
import { r2 } from './lib.js';
import { str } from './rules.js';

const HOUR = 36e5, DAY = 864e5, TZ = 3 * HOUR;
const dayStart = ms => Math.floor((ms + TZ) / DAY) * DAY - TZ;            // 00:00 Addis time of the day that contains ms
const dayKey = ms => new Date(ms + TZ).toISOString().slice(0, 10);
export const AGE_BUCKETS = [['0-30', 0, 30], ['31-60', 31, 60], ['61-90', 61, 90], ['90+', 91, Infinity]];

// Credit invoices with a balance, grouped by how many days ago they were issued
export function unpaidByAge(rows, now) {
  const out = AGE_BUCKETS.map(([label]) => ({ label, count: 0, amount: 0 }));
  for (const r of rows) {
    if (r.type !== 'Credit' || !(r.balance > 0)) continue;
    const age = Math.max(0, Math.floor((dayStart(now) - dayStart(r.date)) / DAY));
    const i = AGE_BUCKETS.findIndex(([, a, b]) => age >= a && age <= b);
    out[i].count++; out[i].amount = r2(out[i].amount + r.balance);
  }
  return out;
}
// One number per day for the last n days (zero for a quiet day). Cancelled invoices never count.
export function salesByDay(rows, now, n) {
  const days = Array.from({ length: n }, (_, i) => dayKey(dayStart(now) - (n - 1 - i) * DAY)), sum = new Map(days.map(d => [d, 0]));
  for (const r of rows) { const k = dayKey(r.date); if (sum.has(k) && r.status !== 'Cancelled') sum.set(k, r2(sum.get(k) + r.total)); }
  return days.map(day => ({ day, total: sum.get(day) }));
}

export function mountInsight({ app, db, cfg, auth, wrap, invoiceList, notifier }) {
  app.get('/api/insight/manager', auth('MGR'), wrap(async (q, s) => {
    const now = Date.now(), today0 = dayStart(now), from30 = today0 - 29 * DAY;
    const [invoices, open, pays] = await Promise.all([
      invoiceList(from30, now + DAY),
      invoiceList(0, now + DAY),
      db.q('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE `at` >= ?', [new Date(today0)])
    ]);
    const cashSales = invoices.filter(r => r.type === 'Cash' && r.status !== 'Cancelled' && r.date >= today0).reduce((a, r) => a + r.total, 0);
    const collected = r2(cashSales + +pays[0].paid);   // cash invoices are paid when issued; credit is paid by payments
    const series = salesByDay(invoices, now, 30);
    const sum = a => r2(a.reduce((x, d) => x + d.total, 0));
    s.json({ collected: { cashSales: r2(cashSales), payments: r2(+pays[0].paid), total: collected }, unpaid: unpaidByAge(open, now), sales30: series, sales7: series.slice(-7), total7: sum(series.slice(-7)), total30: sum(series) });
  }));

  // Parts that sit on the shelf, the parts that move most, and what customers asked for and could not get
  app.get('/api/insight/stock', auth('MGR'), wrap(async (q, s) => {
    const days = Math.min(365, Math.max(30, parseInt(q.query.days, 10) || 90)), cut = new Date(Date.now() - days * DAY), since = new Date(Date.now() - 90 * DAY);
    const [idle, top, lost] = await Promise.all([
      db.q(`SELECT i.id, i.code, i.name, i.stock, i.cost, (SELECT MAX(m.\`at\`) FROM stock_moves m WHERE m.part_id = i.id AND m.delta <> 0) AS last_move
            FROM inventory i WHERE i.active = 1 AND i.stock > 0
            AND NOT EXISTS (SELECT 1 FROM stock_moves m WHERE m.part_id = i.id AND m.delta <> 0 AND m.\`at\` >= ?) ORDER BY i.stock * i.cost DESC LIMIT 100`, [cut]),
      db.q(`SELECT i.id, i.code, i.name, i.stock, i.reorder, SUM(-m.delta) AS sold FROM stock_moves m JOIN inventory i ON i.id = m.part_id
            WHERE m.delta < 0 AND m.reason NOT LIKE 'Adjusted%' AND m.reason NOT LIKE 'Price%' AND m.\`at\` >= ? GROUP BY i.id, i.code, i.name, i.stock, i.reorder ORDER BY sold DESC LIMIT 20`, [since]),
      db.q('SELECT code, name, COUNT(*) AS times, SUM(qty) AS qty, MAX(price) AS price, MAX(`at`) AS last_at FROM lost_sales WHERE `at` >= ? GROUP BY code, name ORDER BY times DESC, qty DESC LIMIT 30', [since])
    ]);
    const have = new Map((await db.q('SELECT code, stock FROM inventory WHERE active = 1')).map(r => [String(r.code).toUpperCase(), +r.stock]));
    s.json({
      days,
      idle: idle.map(r => ({ id: r.id, code: r.code, name: r.name, stock: +r.stock, value: r2(+r.stock * +r.cost), last_move: r.last_move })),
      top: top.map(r => ({ id: r.id, code: r.code, name: r.name, sold: +r.sold, stock: +r.stock, reorder: +r.reorder })),
      // "what to buy": the lost-sale records of the last 90 days, most asked first; a part that is now back in stock is marked
      buy: lost.map(r => ({ code: r.code, name: r.name, times: +r.times, qty: +r.qty, price: +r.price, last_at: r.last_at, in_stock: have.get(String(r.code || '').toUpperCase()) ?? null }))
    });
  }));

  // ---- service-due reminders ----
  app.get('/api/service-due/reminders', auth('SA'), wrap(async (q, s) => {
    s.json(await db.q('SELECT vid, next_km, channel, MAX(`at`) AS `at` FROM service_reminders GROUP BY vid, next_km, channel'));
  }));

  // Telegram when the customer has linked it, SMS otherwise (see notifier.sendText). The same service is not reminded twice within 14 days unless force is sent.
  app.post('/api/service-due/remind', auth('SA'), wrap(async (q, s) => {
    const [v] = await db.q('SELECT * FROM vehicles WHERE id = ?', [str(q.body.vid, 40)]);
    if (!v) fail(404, 'Vehicle not found');
    if (!v.next_km) fail(409, 'This vehicle has no next service set');
    const [c] = await db.q('SELECT * FROM customers WHERE id = ?', [v.cid]);
    if (!c) fail(404, 'Customer not found');
    const [last] = await db.q('SELECT MAX(`at`) AS at FROM service_reminders WHERE vid = ? AND next_km = ?', [v.id, v.next_km]);
    if (!q.body.force && last?.at && Date.now() - new Date(last.at).getTime() < 14 * DAY) fail(409, 'A reminder for this service was already sent in the last 14 days');
    const [st] = v.next_type ? await db.q('SELECT name FROM service_types WHERE code = ?', [v.next_type]) : [];
    const vars = { name: c.name, plate: v.plate, service: st?.name || 'service', km: Number(v.next_km).toLocaleString('en'), phone: cfg.garage.phone };
    const text = cfg.serviceMessage.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    let channel;
    try { channel = await notifier.sendText(c, text); } catch (e) { fail(409, e.message); }
    await db.q('INSERT INTO service_reminders (vid, next_km, channel, `at`, by_name) VALUES (?,?,?, UTC_TIMESTAMP(3), ?)', [v.id, v.next_km, channel, q.u.name]);
    s.json({ ok: true, channel });
  }));
}
