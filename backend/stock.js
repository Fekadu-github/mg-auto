// Parts stock, GRN and point-of-sale rules. Pure functions (no database, no clock) so they can be unit-tested: node --test
import { fail } from './errors.js';
import { r2 } from './lib.js';

// ---- part numbers ----
// A part number starts with the model letter: S = Suzuki, T = Toyota, B = BYD.
export const MAKES = { S: 'Suzuki', T: 'Toyota', B: 'BYD' };
export const makeOf = code => MAKES[String(code || '').trim().toUpperCase().charAt(0)] || '';
export const PREFIX_MSG = 'A part number starts with S (Suzuki), T (Toyota) or B (BYD)';
export function assertPartNo(code) {
  if (!makeOf(code)) fail(400, `${PREFIX_MSG}: "${code}" does not.`);
}

// What the screens receive for a part. The cost is only for the manager; everyone else sees the selling price.
export const partView = (r, mgr = true) => {
  const o = { ...r, price: +r.price, stock: +r.stock, reorder: +r.reorder, active: !!r.active, make: makeOf(r.code), category: r.category || '' };
  if (mgr) o.cost = +r.cost || 0; else delete o.cost;
  return o;
};

// ---- search by typing (server side) ----
// Words typed in any order must all appear in the part number or the description. Returns the SQL pieces and the ranking.
export const searchWords = text => String(text || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).map(w => w.slice(0, 40));
const likeEsc = w => w.replace(/[\\%_]/g, c => '\\' + c);
export function partSearchSql(text) {
  const words = searchWords(text);
  if (!words.length) return null;
  return { where: words.map(() => "CONCAT(LOWER(code), ' ', LOWER(name)) LIKE ?").join(' AND '), params: words.map(w => `%${likeEsc(w)}%`), words };
}
// Part numbers that start with the typed text come first, then part numbers that contain it, then descriptions (same order as the old on-screen list)
export function rankParts(rows, text, limit = 8) {
  const words = searchWords(text), w0 = words[0] || '';
  return rows.map(p => {
    const code = String(p.code).toLowerCase(), name = String(p.name).toLowerCase();
    return [code === w0 ? 0 : code.startsWith(w0) ? 1 : code.includes(w0) ? 2 : name.startsWith(w0) ? 3 : 4, code, p];
  }).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).slice(0, limit).map(x => x[2]);
}
// What a search result shows. A technician sees the part and whether it is in stock, never prices or quantities.
export const searchView = (p, tech) => (tech ? { id: p.id, code: p.code, name: p.name, in_stock: +p.stock > 0 } : { id: p.id, code: p.code, name: p.name, price: +p.price, stock: +p.stock, reorder: +p.reorder, make: makeOf(p.code) });

// ---- price = cost x markup (1.3), unless the manager types another price ----
export const DEFAULT_MARKUP = 1.3;
export const priceFromCost = (cost, markup = DEFAULT_MARKUP) => r2(Math.max(0, +cost || 0) * markup);
const blank = v => v === undefined || v === null || String(v).trim() === '';
export const money0 = (v, what) => {
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) fail(400, `${what} must be a number of zero or more`);
  return r2(n);
};

// The form for a new or edited item. `price` empty (or not sent) means "fill it from the cost".
export function itemForm(b, markup = DEFAULT_MARKUP, { isNew = true } = {}) {
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  const f = { code: str(b.code, 40).toUpperCase(), name: str(b.name, 120), category: str(b.category, 60) };
  if (isNew) { if (!f.code || !f.name) fail(400, 'Part number and description are required'); assertPartNo(f.code); }
  else if (!f.name) fail(400, 'Description is required');
  f.cost = blank(b.cost) ? 0 : money0(b.cost, 'Cost');
  f.priceGiven = !blank(b.price);
  f.price = f.priceGiven ? money0(b.price, 'Price') : priceFromCost(f.cost, markup);
  f.reorder = blank(b.reorder) ? 0 : money0(b.reorder, 'Reorder level');
  f.qty = blank(b.stock ?? b.qty) ? 0 : money0(b.stock ?? b.qty, 'Quantity');
  return f;
}

// ---- Excel import ----
// Rows come from the browser as objects keyed by the sheet's header text. Header names are matched loosely.
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADERS = {
  code: ['partnumber', 'partno', 'partnumberno', 'part', 'code', 'partcode', 'itemcode', 'itemno', 'sku', 'partnum', 'part'],
  name: ['description', 'name', 'partname', 'item', 'itemname', 'itemdescription', 'partdescription', 'desc'],
  qty: ['quantity', 'qty', 'stock', 'onhand', 'instock', 'quantityonhand'],
  cost: ['cost', 'unitcost', 'purchasecost', 'costprice', 'buyingprice', 'purchaseprice'],
  price: ['price', 'sellingprice', 'unitprice', 'saleprice', 'retailprice', 'sellprice'],
  reorder: ['reorder', 'reorderlevel', 'minstock', 'minimumstock', 'minimum', 'minqty', 'min', 'minimumquantity', 'reorderat'],
  category: ['category', 'group', 'type', 'class', 'family']
};
const FIELD_OF = Object.fromEntries(Object.entries(HEADERS).flatMap(([f, hs]) => hs.map(h => [h, f])));

export function mapRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) { const f = FIELD_OF[norm(k)]; if (f && out[f] === undefined && !blank(v)) out[f] = v; }
  return out;
}

// rows: [{ 'Part number': 'T-123', ... }]; existing: Map(code -> inventory row). Returns what to do and what is wrong, row by row.
// A row for a part that exists updates it (the quantity in the file becomes the stock, like a stock count); a new part number creates it.
export function parseImport(rows, markup = DEFAULT_MARKUP, existing = new Map()) {
  const items = [], errors = [], seen = new Set();
  if (!Array.isArray(rows)) fail(400, 'No rows to import');
  if (rows.length > 5000) fail(400, 'Import up to 5,000 rows at a time');
  rows.forEach((raw, i) => {
    const line = i + 2;                                        // the sheet's header is row 1
    const r = mapRow(raw);
    if (!Object.keys(r).length) return;                        // an empty row
    try {
      const code = String(r.code ?? '').trim().toUpperCase();
      if (!code) fail(400, 'Part number is missing');
      if (seen.has(code)) fail(400, `Part number ${code} is repeated in the file`);
      seen.add(code);
      const old = existing.get(code);
      if (!old) assertPartNo(code);
      const name = String(r.name ?? old?.name ?? '').trim().slice(0, 120);
      if (!name) fail(400, 'Description is missing');
      const it = { line, code, name, action: old ? 'update' : 'new', id: old?.id || null };
      if (r.category !== undefined) it.category = String(r.category).trim().slice(0, 60);
      if (r.cost !== undefined) it.cost = money0(r.cost, 'Cost');
      if (r.reorder !== undefined) it.reorder = money0(r.reorder, 'Reorder level');
      if (r.qty !== undefined) it.qty = money0(r.qty, 'Quantity');
      if (r.price !== undefined) it.price = money0(r.price, 'Price');
      else if (it.cost !== undefined && (!old || it.cost !== +old.cost)) it.price = priceFromCost(it.cost, markup);   // price follows the cost
      else if (!old) it.price = priceFromCost(it.cost ?? 0, markup);
      if (!old) { it.cost ??= 0; it.reorder ??= 0; it.qty ??= 0; it.category ??= ''; }
      items.push(it);
    } catch (e) { errors.push({ line, code: String(r.code ?? '').trim(), error: e.message }); }
  });
  return { items, errors };
}

// ---- all prices up or down by the same percentage ----
export function bulkPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) fail(400, 'Enter a percentage, for example 10 (up) or -5 (down)');
  if (n <= -90 || n > 1000) fail(400, 'The percentage must be above -90 and up to 1000');
  return n;
}
export const bumpPrice = (price, pct) => r2(Math.max(0, +price || 0) * (1 + pct / 100));

// ---- sales (point of sale) ----
export const SALE_KINDS = ['Cash', 'Credit', 'Proforma'];
export function saleTotals(lines, vat) {
  const sub = r2(lines.reduce((s, l) => s + l.qty * l.price, 0)), v = r2(sub * vat);
  return { sub, vat: v, total: r2(sub + v), rate: vat };
}
// lines from the screen are { pid, qty }; the price always comes from the stock list, never from the screen
export function cleanSaleLines(raw) {
  if (!Array.isArray(raw) || !raw.length) fail(400, 'Add at least one part');
  if (raw.length > 100) fail(400, 'A sale can have up to 100 lines');
  const byPid = new Map();
  for (const l of raw) {
    const qty = r2(Number(l.qty));
    if (!l.pid || !(qty > 0)) fail(400, 'Every line needs a part and a quantity above zero');
    byPid.set(l.pid, r2((byPid.get(l.pid) || 0) + qty));        // the same part twice becomes one line
  }
  return [...byPid].map(([pid, qty]) => ({ pid, qty })).sort((a, b) => (a.pid < b.pid ? -1 : 1));   // fixed order: no deadlocks between two sales
}

// ---- reports (pure) ----
const day = (ms, eat = 3 * 3600e3) => new Date(ms + eat).toISOString().slice(0, 10);
export function salesReport(sales, a, b) {
  const days = new Map(), items = new Map(), list = [];
  let cancelled = { count: 0, total: 0 };
  for (const s of sales) {
    const t = new Date(s.created).getTime();
    if (!(s.kind === 'Cash' || s.kind === 'Credit') || t < a || t >= b) continue;
    if (s.status === 'Cancelled') { cancelled.count++; cancelled.total = r2(cancelled.total + s.totals.total); continue; }
    list.push({ id: s.id, date: t, kind: s.kind, customer: s.cust_name, tin: s.cust_tin, ...s.totals, by: s.by_name });
    const k = day(t), d = days.get(k) || { day: k, count: 0, cash: 0, credit: 0, sub: 0, vat: 0, total: 0 };
    d.count++; d[s.kind === 'Cash' ? 'cash' : 'credit'] = r2(d[s.kind === 'Cash' ? 'cash' : 'credit'] + s.totals.total);
    d.sub = r2(d.sub + s.totals.sub); d.vat = r2(d.vat + s.totals.vat); d.total = r2(d.total + s.totals.total); days.set(k, d);
    for (const l of s.lines) { const it = items.get(l.code) || { code: l.code, name: l.name, qty: 0, amount: 0 }; it.qty = r2(it.qty + l.qty); it.amount = r2(it.amount + l.qty * l.price); items.set(l.code, it); }
  }
  const rows = [...days.values()].sort((x, y) => (x.day < y.day ? -1 : 1));
  const sum = rows.reduce((s, r) => ({ count: s.count + r.count, cash: r2(s.cash + r.cash), credit: r2(s.credit + r.credit), sub: r2(s.sub + r.sub), vat: r2(s.vat + r.vat), total: r2(s.total + r.total) }), { count: 0, cash: 0, credit: 0, sub: 0, vat: 0, total: 0 });
  return { days: rows, sales: list.sort((x, y) => x.date - y.date), items: [...items.values()].sort((x, y) => y.amount - x.amount), cancelled, sum };
}

// Stock movement reasons grouped for the inventory control report
export function moveGroup(reason) {
  const r = String(reason || '');
  if (/^(grn|received|opening)/i.test(r)) return 'received';
  if (/^sold/i.test(r)) return 'sold';
  if (/^issued/i.test(r)) return 'issued';
  if (/^(returned|sale cancelled)/i.test(r)) return 'returned';
  return 'adjusted';
}
export function inventoryReport(parts, moves) {
  const by = new Map();
  for (const m of moves) {
    const o = by.get(m.part_id) || { received: 0, sold: 0, issued: 0, returned: 0, adjusted: 0 };
    o[moveGroup(m.reason)] = r2(o[moveGroup(m.reason)] + Number(m.delta)); by.set(m.part_id, o);
  }
  const items = parts.map(p => {
    const stock = +p.stock, reorder = +p.reorder, cost = +p.cost || 0, price = +p.price;
    return { id: p.id, code: p.code, name: p.name, make: makeOf(p.code), category: p.category || '', stock, reorder, cost, price,
      value_cost: r2(stock * cost), value_price: r2(stock * price), status: stock <= 0 ? 'Out of stock' : stock <= reorder ? 'Low' : 'OK', ...(by.get(p.id) || { received: 0, sold: 0, issued: 0, returned: 0, adjusted: 0 }) };
  }).sort((x, y) => (x.code < y.code ? -1 : 1));
  const sum = items.reduce((s, i) => ({ items: s.items + 1, units: r2(s.units + i.stock), value_cost: r2(s.value_cost + i.value_cost), value_price: r2(s.value_price + i.value_price), low: s.low + (i.status === 'Low' ? 1 : 0), out: s.out + (i.status === 'Out of stock' ? 1 : 0) }), { items: 0, units: 0, value_cost: 0, value_price: 0, low: 0, out: 0 });
  return { items, sum };
}

export function lostReport(rows) {
  const by = new Map();
  for (const r of rows) { const k = r.code || r.name, o = by.get(k) || { code: r.code, name: r.name, attempts: 0, qty: 0, value: 0 }; o.attempts++; o.qty = r2(o.qty + Number(r.qty)); o.value = r2(o.value + Number(r.qty) * Number(r.price || 0)); by.set(k, o); }
  const items = [...by.values()].sort((x, y) => y.attempts - x.attempts);
  return { items, count: rows.length, qty: r2(items.reduce((s, i) => s + i.qty, 0)), value: r2(items.reduce((s, i) => s + i.value, 0)) };
}

// Invoice status from the amounts: what was paid against what is due
export function invoiceStatus(total, paid, cancelled) {
  if (cancelled) return 'Cancelled';
  const bal = r2(total - paid);
  return bal <= 0.005 ? 'Paid' : paid > 0.005 ? 'Part paid' : 'Unpaid';
}
