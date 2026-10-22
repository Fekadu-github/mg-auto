// Data sources for the user-defined report. Each source says which columns it has and how to load its rows for a date range.
// The screen lets the manager pick the columns, filter, sort and group; the server only supplies flat rows.
import { J } from './db.js';
import { makeOf } from './stock.js';
import { r2 } from './lib.js';

const EAT = 3 * 3600e3;
const when = t => (t ? new Date(new Date(t).getTime() + EAT).toISOString().slice(0, 16).replace('T', ' ') : '');   // Addis Ababa time
const col = (key, label, type = 'text') => ({ key, label, type });
const LIMIT = 'LIMIT 20000';

export const SOURCES = {
  stock: {
    label: 'Stock list (now)', dated: false,
    columns: [col('code', 'Part number'), col('name', 'Description'), col('make', 'Make'), col('category', 'Category'), col('qty', 'Quantity', 'num'), col('reorder', 'Reorder level', 'num'),
      col('cost', 'Cost', 'num'), col('price', 'Price', 'num'), col('status', 'Status'), col('value_cost', 'Value at cost', 'num'), col('value_price', 'Value at price', 'num')],
    load: async q => (await q('SELECT * FROM inventory WHERE active = 1 ORDER BY code ' + LIMIT)).map(p => {
      const st = +p.stock, rl = +p.reorder;
      return { code: p.code, name: p.name, make: makeOf(p.code) || 'Other', category: p.category || '', qty: st, reorder: rl, cost: +p.cost, price: +p.price, status: st <= 0 ? 'Out of stock' : st <= rl ? 'Low' : 'OK', value_cost: r2(st * +p.cost), value_price: r2(st * +p.price) };
    })
  },
  moves: {
    label: 'Stock movements', dated: true,
    columns: [col('date', 'Date'), col('code', 'Part number'), col('name', 'Description'), col('reason', 'What'), col('change', 'Change', 'num'), col('balance', 'Balance', 'num'), col('ref', 'Reference'), col('by', 'By'), col('note', 'Note')],
    load: async (q, a, b) => (await q('SELECT m.`at`, i.code, i.name, m.reason, m.delta, m.balance, m.job, m.by_name, m.note FROM stock_moves m JOIN inventory i ON i.id = m.part_id WHERE m.`at` >= ? AND m.`at` < ? ORDER BY m.`at` DESC, m.id DESC ' + LIMIT, [a, b]))
      .map(m => ({ date: when(m.at), code: m.code, name: m.name, reason: m.reason, change: +m.delta, balance: +m.balance, ref: m.job || '', by: m.by_name || '', note: m.note || '' }))
  },
  sales: {
    label: 'Sales and proformas (one row per document)', dated: true,
    columns: [col('date', 'Date'), col('no', 'Number'), col('kind', 'Type'), col('status', 'Status'), col('customer', 'Customer'), col('tin', 'TIN'), col('sub', 'Subtotal', 'num'), col('vat', 'VAT', 'num'), col('total', 'Total', 'num'), col('by', 'By')],
    load: async (q, a, b) => (await q('SELECT * FROM sales WHERE created >= ? AND created < ? ORDER BY created DESC ' + LIMIT, [a, b]))
      .map(s => { const t = J(s.totals, {}); return { date: when(s.created), no: s.id, kind: s.kind, status: s.status, customer: s.cust_name, tin: s.cust_tin, sub: t.sub, vat: t.vat, total: t.total, by: s.by_name || '' }; })
  },
  items: {
    label: 'Parts sold (one row per part on a sale)', dated: true,
    columns: [col('date', 'Date'), col('no', 'Sale'), col('kind', 'Type'), col('status', 'Status'), col('code', 'Part number'), col('make', 'Make'), col('name', 'Description'), col('qty', 'Quantity', 'num'), col('price', 'Price', 'num'), col('amount', 'Amount', 'num'), col('customer', 'Customer')],
    load: async (q, a, b) => (await q("SELECT * FROM sales WHERE kind IN ('Cash','Credit') AND created >= ? AND created < ? ORDER BY created DESC " + LIMIT, [a, b]))
      .flatMap(s => J(s.lines, []).map(l => ({ date: when(s.created), no: s.id, kind: s.kind, status: s.status, code: l.code, make: makeOf(l.code) || 'Other', name: l.name, qty: l.qty, price: l.price, amount: r2(l.qty * l.price), customer: s.cust_name })))
  },
  lost: {
    label: 'Lost sales', dated: true,
    columns: [col('date', 'Date'), col('code', 'Part number'), col('name', 'Description'), col('qty', 'Quantity', 'num'), col('value', 'Value', 'num'), col('reason', 'Reason'), col('source', 'Where'), col('ref', 'Reference'), col('by', 'By')],
    load: async (q, a, b) => (await q('SELECT * FROM lost_sales WHERE `at` >= ? AND `at` < ? ORDER BY `at` DESC ' + LIMIT, [a, b]))
      .map(l => ({ date: when(l.at), code: l.code, name: l.name, qty: +l.qty, value: r2(+l.qty * +l.price), reason: l.reason, source: l.source, ref: l.ref || '', by: l.by_name || '' }))
  },
  grn: {
    label: 'Purchases (GRN lines)', dated: true,
    columns: [col('date', 'Date'), col('grn', 'GRN'), col('supplier', 'Supplier'), col('ref', 'Supplier ref'), col('code', 'Part number'), col('name', 'Description'), col('qty', 'Quantity', 'num'), col('cost', 'Cost', 'num'), col('amount', 'Amount', 'num'), col('by', 'By')],
    load: async (q, a, b) => (await q('SELECT * FROM grns WHERE created >= ? AND created < ? ORDER BY created DESC ' + LIMIT, [a, b]))
      .flatMap(g => J(g.lines, []).map(l => ({ date: when(g.created), grn: g.id, supplier: g.supplier, ref: g.ref, code: l.code, name: l.name, qty: l.qty, cost: l.cost, amount: r2(l.qty * l.cost), by: g.by_name || '' })))
  }
};
