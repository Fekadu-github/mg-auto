// Parts stock management (manager), goods received notes (GRN), point of sale, payments, lost sales and the extra reports.
// createApp calls mountStock() once. Every stock change goes through adjustStock (atomic, never below zero, always in stock_moves).
import { fail } from './errors.js';
import { adjustStock, newId, numberFor, J } from './db.js';
import { range, r2 } from './lib.js';
import { str, qn } from './rules.js';
import * as S from './stock.js';
import { SOURCES } from './custom.js';
import { mountInsight } from './insight.js';

const sendJson = v => JSON.stringify(v);
const isMgr = u => ['ADMIN', 'MGR'].includes(u.role);
export const PAY_METHODS = ['Cash', 'Bank transfer', 'Telebirr', 'Cheque', 'Other'];

// A refused sale or issue: the 409 carries what was wanted, so the lost sale is recorded after the transaction has been undone
export function shortage(parts, source, ref) {
  const lost = parts.map(({ p, qty }) => ({ code: p.code, name: p.name, qty, price: +p.price, reason: +p.stock > 0 ? 'Not enough stock' : 'Out of stock', source, ref: ref || null }));
  const msg = 'Not enough stock of ' + parts.map(({ p, qty }) => `${p.name} (${+p.stock} on hand, ${qty} needed)`).join('; ');
  return Object.assign(new Error(msg), { code: 409, lost });
}

// Lost sales are written outside any transaction (the refused one was rolled back) and never get in the way of the answer
export async function recordLost(db, rows, by) {
  for (const r of rows) {
    await db.q('INSERT INTO lost_sales (`at`, code, name, qty, price, reason, source, ref, by_name) VALUES (UTC_TIMESTAMP(3),?,?,?,?,?,?,?,?)',
      [str(r.code, 40), str(r.name, 120), Math.max(0.01, qn(r.qty) || 1), Math.max(0, qn(r.price) || 0), str(r.reason, 60), str(r.source, 30), r.ref ? str(r.ref, 40) : null, by || null]);
  }
}

const saleRow = r => r && ({
  id: r.id, kind: r.kind, status: r.status, cid: r.cid || null, cust_name: r.cust_name, cust_phone: r.cust_phone, cust_tin: r.cust_tin,
  lines: J(r.lines, []), totals: J(r.totals, {}), show_codes: !!r.show_codes, note: r.note, created: r.created, by_name: r.by_name,
  cancelled_at: r.cancelled_at || null, cancelled_by: r.cancelled_by || null, cancel_reason: r.cancel_reason || null, from_pro: r.from_pro || null, converted_to: r.converted_to || null
});
const grnRow = r => r && ({ id: r.id, supplier: r.supplier, ref: r.ref, note: r.note, lines: J(r.lines, []), total: +r.total, created: r.created, by_name: r.by_name });

export function mountStock({ app, db, cfg, auth, wrap, notifier }) {
  const stock = async (c, id, d, reason, ref, by, note) => {
    const bal = await adjustStock(c, id, d, reason, ref, by, note);
    if (bal === null) fail(d > 0 ? 404 : 409, d > 0 ? 'Part not found' : 'Not enough stock');
    return bal;
  };
  // a change of cost or price is part of the part's history (a row with no quantity change)
  const priceNote = (c, id, bal, note, by) => c.q("INSERT INTO stock_moves (part_id, delta, balance, reason, job, by_name, note, `at`) VALUES (?,0,?,'Price changed',NULL,?,?, UTC_TIMESTAMP(3))", [id, bal, by, str(note, 200)]);
  const part = async id => (await db.q('SELECT * FROM inventory WHERE id = ?', [id]))[0];

  // ================= items (manager) =================
  // Only the manager creates items and changes cost or price. The price fills itself as cost x 1.3; the manager can type another.
  app.post('/api/inventory', auth('MGR'), wrap(async (q, s) => {
    const f = S.itemForm(q.body, S.DEFAULT_MARKUP), id = newId();
    await db.tx(async c => {
      if ((await c.q('SELECT id FROM inventory WHERE code = ?', [f.code])).length) fail(409, 'A part with this number already exists');
      await c.q('INSERT INTO inventory (id, code, name, category, cost, price, stock, reorder, active, created_at) VALUES (?,?,?,?,?,?,0,?,1, UTC_TIMESTAMP(3))', [id, f.code, f.name, f.category, f.cost, f.price, f.reorder]);
      if (f.qty > 0) await stock(c, id, f.qty, 'Opening stock', null, q.u.name);
    });
    s.json(S.partView(await part(id), true));
  }));

  app.put('/api/inventory/:id', auth('MGR'), wrap(async (q, s) => {
    const b = q.body;
    await db.tx(async c => {
      const [old] = await c.q('SELECT * FROM inventory WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!old) fail(404, 'Part not found');
      const name = b.name === undefined ? old.name : str(b.name, 120);
      if (!name) fail(400, 'Description is required');
      const blank = v => v === undefined || v === null || String(v).trim() === '';
      const cost = blank(b.cost) ? +old.cost : S.money0(b.cost, 'Cost');
      let price = +old.price;
      if (!blank(b.price)) price = S.money0(b.price, 'Price');
      else if (cost !== +old.cost) price = S.priceFromCost(cost);          // a new cost with no price typed: the price follows (cost x 1.3)
      const reorder = blank(b.reorder) ? +old.reorder : S.money0(b.reorder, 'Reorder level');
      const category = b.category === undefined ? old.category : str(b.category, 60);
      const active = b.active === undefined ? old.active : b.active ? 1 : 0;
      await c.q('UPDATE inventory SET name = ?, category = ?, cost = ?, price = ?, reorder = ?, active = ? WHERE id = ?', [name, category, cost, price, reorder, active, old.id]);
      if (cost !== +old.cost || price !== +old.price) await priceNote(c, old.id, +old.stock, `cost ${+old.cost} → ${cost}; price ${+old.price} → ${price}`, q.u.name);
    });
    s.json(S.partView(await part(q.params.id), true));
  }));

  // Import from Excel. rows = the sheet as objects keyed by header text. apply:false only checks the file and says what would happen.
  app.post('/api/inventory/import', auth('MGR'), wrap(async (q, s) => {
    const existing = new Map((await db.q('SELECT * FROM inventory')).map(r => [String(r.code).toUpperCase(), r]));
    const { items, errors } = S.parseImport(q.body.rows, S.DEFAULT_MARKUP, existing);
    const summary = { created: items.filter(i => i.action === 'new').length, updated: items.filter(i => i.action === 'update').length };
    if (!q.body.apply) return s.json({ ...summary, applied: false, errors: errors.slice(0, 200), errorCount: errors.length, preview: items.slice(0, 30) });
    // Saved in batches: a few multi-row statements per 200 parts instead of 4-6 round trips per part (a 1,000-part file used to take minutes
    // against a remote database, long enough for the host to cut the request off and leave the screen waiting).
    await db.tx(async c => {
      const by = q.u.name, ph = (n, tpl) => Array(n).fill(tpl).join(',');
      const insertMoves = async moves => {
        for (let i = 0; i < moves.length; i += 200) {
          const part = moves.slice(i, i + 200);
          await c.q(`INSERT INTO stock_moves (part_id, delta, balance, reason, job, by_name, note, \`at\`) VALUES ${ph(part.length, '(?,?,?,?,NULL,?,?,UTC_TIMESTAMP(3))')}`, part.flatMap(m => [m.id, m.delta, m.balance, m.reason, by, m.note ?? null]));
        }
      };
      const fresh = items.filter(i => i.action === 'new'), changed = items.filter(i => i.action === 'update');
      for (let i = 0; i < fresh.length; i += 200) {
        const part = fresh.slice(i, i + 200).map(it => ({ it, id: newId() }));
        await c.q(`INSERT INTO inventory (id, code, name, category, cost, price, stock, reorder, active, created_at) VALUES ${ph(part.length, '(?,?,?,?,?,?,?,?,1,UTC_TIMESTAMP(3))')}`,
          part.flatMap(({ it, id }) => [id, it.code, it.name, it.category, it.cost, it.price, it.qty > 0 ? it.qty : 0, it.reorder]));
        await insertMoves(part.filter(({ it }) => it.qty > 0).map(({ it, id }) => ({ id, delta: it.qty, balance: it.qty, reason: 'Opening stock (Excel import)' })));
      }
      for (let i = 0; i < changed.length; i += 200) {
        const part = changed.slice(i, i + 200), ids = part.map(it => it.id);
        const rows = new Map((await c.q('SELECT * FROM inventory WHERE id IN (?) ORDER BY id FOR UPDATE', [ids])).map(r => [r.id, r]));   // one lock for the batch, in a fixed order
        const moves = [], vals = [];
        for (const it of part) {
          const old = rows.get(it.id);
          if (!old) fail(409, `Part ${it.code} was removed while the file was being imported. Try again.`);
          const cost = it.cost ?? +old.cost, price = it.price ?? +old.price;
          let stockNow = +old.stock;
          vals.push(it, old, cost, price);
          if (cost !== +old.cost || price !== +old.price) moves.push({ id: old.id, delta: 0, balance: stockNow, reason: 'Price changed', note: str(`Excel import: cost ${+old.cost} → ${cost}; price ${+old.price} → ${price}`, 200) });
          if (it.qty !== undefined) {
            const d = qn(it.qty - +old.stock);
            if (d) { stockNow = +it.qty; moves.push({ id: old.id, delta: d, balance: stockNow, reason: 'Adjusted (Excel import)', note: 'Quantity set from the Excel file' }); }
          }
          vals.push(stockNow);
        }
        const params = [];
        for (let k = 0; k < vals.length; k += 5) {
          const [it, old, cost, price, stockNow] = vals.slice(k, k + 5);
          params.push(old.id, old.code, it.name, it.category ?? old.category, cost, price, stockNow, it.reorder ?? +old.reorder);
        }
        await c.q(`INSERT INTO inventory (id, code, name, category, cost, price, stock, reorder, active) VALUES ${ph(part.length, '(?,?,?,?,?,?,?,?,1)')} ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), cost = VALUES(cost), price = VALUES(price), stock = VALUES(stock), reorder = VALUES(reorder), active = 1`, params);
        await insertMoves(moves);
      }
    });
    s.json({ ...summary, applied: true, errors: errors.slice(0, 200), errorCount: errors.length });
  }));

  // All prices up or down by the same percentage (optionally only one make: S, T or B, or '-' for parts with no model)
  app.post('/api/inventory/bulk-price', auth('MGR'), wrap(async (q, s) => {
    const pct = S.bulkPercent(q.body.percent), want = String(q.body.make || '').toUpperCase();
    const letter = S.MAKES[want] ? want : '', other = want === '-';                // '-' = parts with no model (oil and the like)
    const where = letter ? 'UPPER(LEFT(code, 1)) = ?' : other ? "UPPER(LEFT(code, 1)) NOT IN ('S', 'T', 'B')" : '1 = 1', wp = letter ? [letter] : [];
    const factor = 1 + pct / 100, note = `All ${letter ? S.MAKES[letter] + ' ' : other ? 'other (no model) ' : ''}prices ${pct > 0 ? '+' : ''}${pct}%`;
    const count = await db.tx(async c => {
      await c.q(`INSERT INTO stock_moves (part_id, delta, balance, reason, job, by_name, note, \`at\`) SELECT id, 0, stock, 'Price changed', NULL, ?, CONCAT(?, ': ', price, ' → ', ROUND(price * ?, 2)), UTC_TIMESTAMP(3) FROM inventory WHERE active = 1 AND ${where}`, [q.u.name, note, factor, ...wp]);
      const r = await c.q(`UPDATE inventory SET price = ROUND(price * ?, 2) WHERE active = 1 AND ${where}`, [factor, ...wp]);
      return r.affectedRows;
    });
    s.json({ ok: true, count, percent: pct });
  }));

  // ================= lost sales =================
  app.post('/api/lost-sales', auth('SA'), wrap(async (q, s) => {
    let r = { code: str(q.body.code, 40).toUpperCase(), name: str(q.body.name, 120), qty: q.body.qty, price: q.body.price, reason: str(q.body.reason, 60) || 'Not in the stock list', source: str(q.body.source, 30) || 'Counter', ref: q.body.ref };
    if (q.body.pid) { const p = await part(q.body.pid); if (p) r = { ...r, code: p.code, name: p.name, price: +p.price, reason: r.reason === 'Not in the stock list' ? (+p.stock > 0 ? 'Not enough stock' : 'Out of stock') : r.reason }; }
    if (!r.name && !r.code) fail(400, 'Say which part the customer wanted');
    r.name ||= r.code;
    await recordLost(db, [r], q.u.name);
    s.json({ ok: true });
  }));

  // ================= GRN: parts bought and added to stock =================
  // Each line: an existing part (searched by number or description), the quantity bought and its cost. The cost is kept on the part and the price
  // follows as cost x 1.3, unless the part has a price the manager set by hand (then it is kept; the manager can send `price` on a line to change it).
  app.post('/api/grns', auth('SA'), wrap(async (q, s) => {
    const supplier = str(q.body.supplier, 200);
    if (!supplier) fail(400, 'Enter the supplier');
    if (!Array.isArray(q.body.lines) || !q.body.lines.length) fail(400, 'Add at least one part');
    if (q.body.lines.length > 200) fail(400, 'A GRN can have up to 200 lines');
    const seen = new Set();
    const lines = q.body.lines.map(l => {
      const qty = qn(l.qty), cost = S.money0(l.cost, 'Cost');
      if (!l.pid || !(qty > 0)) fail(400, 'Every line needs a part and a quantity above zero');
      if (seen.has(l.pid)) fail(400, 'The same part is on two lines: put the quantities on one line');
      seen.add(l.pid);
      return { pid: String(l.pid), qty, cost, price: l.price === undefined || l.price === null || String(l.price).trim() === '' ? null : S.money0(l.price, 'Price') };
    }).sort((a, b) => (a.pid < b.pid ? -1 : 1));
    const grn = await db.tx(async c => {
      const id = await numberFor(c, 'grn', 'GRN-'), out = [];
      let total = 0;
      for (const l of lines) {
        const [p] = await c.q('SELECT * FROM inventory WHERE id = ? AND active = 1 FOR UPDATE', [l.pid]);
        if (!p) fail(404, 'A part on this GRN is no longer in the stock list');
        const auto = (+p.cost === 0 && +p.price === 0) || (+p.cost > 0 && Math.abs(+p.price - S.priceFromCost(+p.cost)) < 0.01);   // the price was following the cost
        let price = +p.price;
        if (l.price !== null && isMgr(q.u)) price = l.price; else if (auto) price = S.priceFromCost(l.cost);
        await stock(c, p.id, l.qty, 'GRN', id, q.u.name, [supplier, str(q.body.ref, 80)].filter(Boolean).join(' · '));
        await c.q('UPDATE inventory SET cost = ?, price = ? WHERE id = ?', [l.cost, price, p.id]);
        if (l.cost !== +p.cost || price !== +p.price) await priceNote(c, p.id, +p.stock + l.qty, `${id}: cost ${+p.cost} → ${l.cost}; price ${+p.price} → ${price}`, q.u.name);
        total = r2(total + l.qty * l.cost);
        out.push({ pid: p.id, code: p.code, name: p.name, qty: l.qty, cost: l.cost, price_before: +p.price, price_after: price });
      }
      await c.q('INSERT INTO grns (id, supplier, ref, note, `lines`, total, created, by_name) VALUES (?,?,?,?,?,?, UTC_TIMESTAMP(3), ?)', [id, supplier, str(q.body.ref, 80), str(q.body.note, 500), sendJson(out), total, q.u.name]);
      return id;
    });
    s.json(grnRow((await db.q('SELECT * FROM grns WHERE id = ?', [grn]))[0]));
  }));
  app.get('/api/grns', auth('SA'), wrap(async (q, s) => s.json((await db.q('SELECT * FROM grns ORDER BY created DESC, id DESC LIMIT 200')).map(grnRow))));

  // ================= point of sale =================
  const customer = async (c, id) => (await c.q('SELECT id, name, phone, tin FROM customers WHERE id = ?', [id]))[0];

  // Make one sale or proforma inside the caller's transaction. Prices always come from the stock list. Cash and credit take the parts out of stock;
  // a proforma is only a quote. When a part is short the whole sale is refused and the lost sales are recorded (see wrap).
  async function makeSale(c, { kind, lines, cust, note, showCodes, by, fromPro = null }) {
    const rows = await c.q('SELECT * FROM inventory WHERE id IN (?) ORDER BY id FOR UPDATE', [lines.map(l => l.pid)]);
    const byId = new Map(rows.map(r => [r.id, r])), out = [], short = [];
    for (const l of lines) {
      const p = byId.get(l.pid);
      if (!p || !p.active) fail(404, 'A part on this sale is no longer in the stock list');
      if (kind !== 'Proforma' && +p.stock < l.qty) short.push({ p, qty: l.qty });
      out.push({ pid: p.id, code: p.code, name: p.name, qty: l.qty, price: +p.price });
    }
    if (short.length) throw shortage(short, 'POS');
    let { cid, name, phone, tin } = cust;
    if (cid) {
      const known = await customer(c, cid);
      if (!known) fail(400, 'Customer not found');
      name ||= known.name; phone ||= known.phone;
      if (tin && tin !== (known.tin || '')) await c.q('UPDATE customers SET tin = ? WHERE id = ?', [tin, cid]);   // a TIN typed at the till is kept on the customer
      else tin ||= known.tin || '';
    }
    if (!name) { if (kind === 'Credit') fail(400, 'A credit sale needs the customer name'); name = kind === 'Proforma' ? '' : 'Walk-in customer'; }
    const id = await numberFor(c, kind === 'Proforma' ? 'sale-proforma' : 'invoice', kind === 'Proforma' ? 'PRF-' : 'INV-');
    const totals = S.saleTotals(out, cfg.vat);
    await c.q("INSERT INTO sales (id, kind, status, cid, cust_name, cust_phone, cust_tin, `lines`, totals, show_codes, note, created, by_name, from_pro) VALUES (?,?,'Issued',?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3), ?, ?)",
      [id, kind, cid || null, name, phone, tin, sendJson(out), sendJson(totals), showCodes ? 1 : 0, note, by, fromPro]);
    if (kind !== 'Proforma') for (const l of out) await stock(c, l.pid, -l.qty, 'Sold', id, by);
    return id;
  }
  const custForm = b => ({ cid: str(b.cid, 40) || null, name: str(b.name, 200), phone: str(b.phone, 30), tin: str(b.tin, 40) });
  const getSale = async id => saleRow((await db.q('SELECT * FROM sales WHERE id = ?', [id]))[0]);

  app.post('/api/sales', auth('SA'), wrap(async (q, s) => {
    const kind = str(q.body.kind, 10);
    if (!S.SALE_KINDS.includes(kind)) fail(400, 'Choose Cash, Credit or Proforma');
    const lines = S.cleanSaleLines(q.body.lines);
    const id = await db.tx(c => makeSale(c, { kind, lines, cust: custForm(q.body), note: str(q.body.note, 500), showCodes: q.body.show_codes !== false, by: q.u.name }));
    s.json(await getSale(id));
  }));

  // The list for the point-of-sale screen: the latest sales, with what has been paid on credit sales
  app.get('/api/sales', auth('SA'), wrap(async (q, s) => {
    const rows = (await db.q('SELECT * FROM sales ORDER BY created DESC, id DESC LIMIT 400')).map(saleRow);
    const paid = new Map((await db.q("SELECT ref, SUM(amount) AS paid FROM payments WHERE source = 'sale' GROUP BY ref")).map(r => [r.ref, +r.paid]));
    s.json(rows.map(r => ({ ...r, paid: r.kind === 'Cash' ? r.totals.total : r.kind === 'Credit' ? paid.get(r.id) || 0 : 0 })));
  }));

  // Only the manager cancels a sale: the parts go back into stock and the sale leaves the reports
  app.post('/api/sales/:id/cancel', auth('MGR'), wrap(async (q, s) => {
    const reason = str(q.body.reason, 200);
    if (!reason) fail(400, 'Say why the sale is cancelled');
    await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM sales WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Sale not found');
      if (row.kind === 'Proforma') fail(409, 'A proforma is not a sale: nothing to cancel');
      if (row.status !== 'Issued') fail(409, `This sale is already ${row.status.toLowerCase()}`);
      const lines = J(row.lines, []).sort((a, b) => (a.pid < b.pid ? -1 : 1));
      for (const l of lines) await stock(c, l.pid, l.qty, 'Sale cancelled', row.id, q.u.name, reason);
      await c.q("UPDATE sales SET status = 'Cancelled', cancelled_at = UTC_TIMESTAMP(3), cancelled_by = ?, cancel_reason = ? WHERE id = ?", [q.u.name, reason, row.id]);
    });
    s.json(await getSale(q.params.id));
  }));

  // A proforma becomes a cash or credit sale (parts leave stock now, at today's prices)
  app.post('/api/sales/:id/convert', auth('SA'), wrap(async (q, s) => {
    const kind = str(q.body.kind, 10);
    if (!['Cash', 'Credit'].includes(kind)) fail(400, 'Choose Cash or Credit');
    const newSale = await db.tx(async c => {
      const [row] = await c.q('SELECT * FROM sales WHERE id = ? FOR UPDATE', [q.params.id]);
      if (!row) fail(404, 'Proforma not found');
      if (row.kind !== 'Proforma') fail(409, 'Only a proforma can be turned into a sale');
      if (row.converted_to) fail(409, `This proforma already became ${row.converted_to}`);
      const id = await makeSale(c, { kind, lines: S.cleanSaleLines(J(row.lines, []).map(l => ({ pid: l.pid, qty: l.qty }))), cust: { cid: row.cid, name: row.cust_name, phone: row.cust_phone, tin: row.cust_tin }, note: row.note, showCodes: true, by: q.u.name, fromPro: row.id });
      await c.q("UPDATE sales SET status = 'Converted', converted_to = ? WHERE id = ?", [id, row.id]);
      return id;
    });
    s.json(await getSale(newSale));
  }));

  // ================= invoices and payments =================
  // One list of every cash and credit invoice: from job cards and from the point of sale. Cash is paid when issued; credit is paid by payments.
  const invoiceList = async (from, to) => {
    const [js, ss, cs, pays] = await Promise.all([
      db.q('SELECT id, cid, inv FROM jobs WHERE inv IS NOT NULL ORDER BY created DESC LIMIT 2000'),
      db.q("SELECT * FROM sales WHERE kind IN ('Cash','Credit') ORDER BY created DESC LIMIT 2000"),
      db.q('SELECT id, name, tin FROM customers'),
      db.q('SELECT id, source, ref, amount, method, note, by_name, `at` FROM payments ORDER BY `at` DESC, id DESC')
    ]);
    const cust = new Map(cs.map(c => [c.id, c])), paidBy = new Map(), payList = new Map();
    for (const p of pays) { const k = p.source + ':' + p.ref; paidBy.set(k, r2((paidBy.get(k) || 0) + +p.amount)); (payList.get(k) || payList.set(k, []).get(k)).push({ id: p.id, amount: +p.amount, method: p.method, note: p.note, by_name: p.by_name, at: p.at }); }
    const rows = [];
    const add = (source, ref, no, date, type, total, cancelled, customerName, tin) => {
      if (date < from || date >= to) return;
      const paid = type === 'Cash' ? total : paidBy.get(source + ':' + ref) || 0;
      rows.push({ key: source + ':' + ref, source, ref, no, date, type, customer: customerName, tin: tin || '', total, paid: cancelled ? 0 : paid, balance: cancelled ? 0 : r2(Math.max(0, total - paid)), status: S.invoiceStatus(total, paid, cancelled), payments: payList.get(source + ':' + ref) || [] });
    };
    for (const j of js) {
      const inv = J(j.inv, null);
      if (!inv || !['Cash', 'Credit'].includes(inv.type)) continue;
      const c = cust.get(j.cid) || {};
      add('job', j.id, inv.no, inv.date, inv.type, inv.totals?.total || 0, false, c.name || '', c.tin);
    }
    for (const sl of ss.map(saleRow)) add('sale', sl.id, sl.id, new Date(sl.created).getTime(), sl.kind, sl.totals.total, sl.status === 'Cancelled', sl.cust_name, sl.cust_tin);
    return rows.sort((a, b) => b.date - a.date);
  };
  app.get('/api/invoices', auth('SA'), wrap(async (q, s) => {
    const [a, b] = q.query.from ? range(q.query) : [0, Date.now() + 864e5];
    s.json(await invoiceList(a, b));
  }));

  app.post('/api/payments', auth('SA'), wrap(async (q, s) => {
    const source = q.body.source, ref = str(q.body.ref, 40), amount = qn(q.body.amount), method = PAY_METHODS.includes(q.body.method) ? q.body.method : 'Cash';
    if (!['job', 'sale'].includes(source) || !ref) fail(400, 'Choose the invoice');
    if (!(amount > 0)) fail(400, 'Enter an amount above zero');
    await db.tx(async c => {
      let total, type, cancelled = false;
      if (source === 'job') {
        const [j] = await c.q('SELECT id, inv FROM jobs WHERE id = ? FOR UPDATE', [ref]);
        const inv = j && J(j.inv, null);
        if (!inv) fail(404, 'Invoice not found');
        ({ type } = inv); total = inv.totals?.total || 0;
      } else {
        const [r] = await c.q('SELECT * FROM sales WHERE id = ? FOR UPDATE', [ref]);
        if (!r || r.kind === 'Proforma') fail(404, 'Invoice not found');
        type = r.kind; total = J(r.totals, {}).total || 0; cancelled = r.status === 'Cancelled';
      }
      if (cancelled) fail(409, 'This sale was cancelled');
      if (type !== 'Credit') fail(409, 'A cash invoice is paid when it is issued: there is nothing to collect');
      const [{ paid }] = await c.q('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE source = ? AND ref = ?', [source, ref]);
      const due = r2(total - +paid);
      if (amount > due + 0.005) fail(400, `The balance is only ${due.toFixed(2)}`);
      await c.q('INSERT INTO payments (source, ref, amount, method, note, by_name, `at`) VALUES (?,?,?,?,?,?, UTC_TIMESTAMP(3))', [source, ref, amount, method, str(q.body.note, 200), q.u.name]);
    });
    const row = (await invoiceList(0, Date.now() + 864e5)).find(r => r.key === `${source}:${ref}`);
    s.json(row);
  }));

  // ================= reports =================
  app.get('/api/reports/sales', auth('SA'), wrap(async (q, s) => {
    const [a, b] = range(q.query);
    const rows = (await db.q("SELECT * FROM sales WHERE kind IN ('Cash','Credit') AND created >= ? AND created < ? ORDER BY created", [new Date(a), new Date(b)])).map(saleRow);
    s.json({ ...S.salesReport(rows, a, b), from: a, to: b });
  }));
  app.get('/api/reports/lost', auth('SA'), wrap(async (q, s) => {
    const [a, b] = range(q.query);
    const rows = (await db.q('SELECT * FROM lost_sales WHERE `at` >= ? AND `at` < ? ORDER BY `at` DESC LIMIT 5000', [new Date(a), new Date(b)])).map(r => ({ ...r, qty: +r.qty, price: +r.price }));
    s.json({ ...S.lostReport(rows), rows, from: a, to: b });
  }));
  // inventory control and the user-defined reports show cost and values: manager only
  app.get('/api/reports/inventory', auth('MGR'), wrap(async (q, s) => {
    const [a, b] = range(q.query);
    const [parts, moves] = await Promise.all([db.q('SELECT * FROM inventory WHERE active = 1'), db.q('SELECT part_id, reason, delta FROM stock_moves WHERE `at` >= ? AND `at` < ?', [new Date(a), new Date(b)])]);
    s.json({ ...S.inventoryReport(parts, moves), from: a, to: b });
  }));
  app.get('/api/reports/custom', auth('MGR'), wrap(async (q, s) => s.json(Object.entries(SOURCES).map(([key, v]) => ({ key, label: v.label, dated: v.dated, columns: v.columns })))));
  app.get('/api/reports/custom/:source', auth('MGR'), wrap(async (q, s) => {
    const src = SOURCES[q.params.source];
    if (!src) fail(404, 'Unknown report source');
    const [a, b] = src.dated ? range(q.query) : [0, 0];
    s.json({ rows: await src.load((sql, p) => db.q(sql, p), new Date(a), new Date(b)) });
  }));

  // manager dashboard numbers, stock insight and service-due reminders
  mountInsight({ app, db, cfg, auth, wrap, invoiceList, notifier });
}
