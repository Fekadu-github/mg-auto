// Parts stock helpers for the screens: model letters, price from cost, the Excel / CSV files, low-stock list. Plain functions, no React.
import { readXlsx, rowsToObjects, downloadXlsx } from './xlsx.js';

// A part number that starts with S = Suzuki, T = Toyota or B = BYD belongs to that make; any other number is a general part (oil and the like) with no model
export const MAKES = { S: 'Suzuki', T: 'Toyota', B: 'BYD' };
export const makeOf = code => MAKES[String(code || '').trim().toUpperCase().charAt(0)] || '';
// '-' in the make filters means "parts with no model"
export const NO_MODEL = '-';
export const inMake = (code, make) => !make || (make === NO_MODEL ? !makeOf(code) : makeOf(code) === MAKES[make]);

// The price fills itself from the cost: cost x 1.3 (the server sends the markup in the settings)
export const MARKUP = 1.3;
export const priceFromCost = (cost, markup = MARKUP) => Math.round((Math.max(0, parseFloat(cost) || 0) * markup + Number.EPSILON) * 100) / 100;

// Parts at or below their reorder level (and parts that are out), worst first
export const lowParts = parts => (parts || []).filter(p => p.stock <= p.reorder)
  .sort((a, b) => (a.stock === 0) !== (b.stock === 0) ? (a.stock === 0 ? -1 : 1) : a.code < b.code ? -1 : 1);
export const lowKey = p => `${p.id}:${p.stock <= 0 ? 'out' : 'low'}`;

// ---- Excel export: the same headers the import understands, so the file can be edited and brought back ----
export const EXPORT_HEAD = ['Part number', 'Description', 'Make', 'Category', 'Quantity', 'Cost', 'Price', 'Reorder level'];
export const exportRows = parts => [EXPORT_HEAD, ...[...parts].sort((a, b) => (a.code < b.code ? -1 : 1)).map(p => [p.code, p.name, makeOf(p.code), p.category || '', p.stock, p.cost ?? '', p.price, p.reorder])];
export const downloadInventory = (parts, name = 'inventory.xlsx') => downloadXlsx(name, exportRows(parts), 'Inventory');
// an empty sheet with the headers (and one example row) to fill in
export const templateRows = () => [EXPORT_HEAD.filter(h => h !== 'Make'), ['T-1001', 'Oil filter', 'Filters', 10, 120, '', 2]];

// ---- reading a file the manager chooses: .xlsx or .csv -> array of objects keyed by the header text ----
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => (c !== '' && !isNaN(+c.replace(/,/g, '')) && /^[\d,.\s-]+$/.test(c) ? +c.replace(/,/g, '') : c.trim())));
}
export async function readItemsFile(file) {
  const name = String(file.name || '').toLowerCase();
  const rows = name.endsWith('.csv') ? parseCsv(await file.text()) : await readXlsx(await file.arrayBuffer());
  return rowsToObjects(rows);
}
