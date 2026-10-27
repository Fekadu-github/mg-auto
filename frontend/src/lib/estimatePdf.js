// The Service Price Estimation (proforma and estimate) as a real PDF file, drawn by hand: no library to install, text stays selectable and sharp.
//   buildEstimatePdf(props, { logo })  -> Uint8Array   props are the EstimationSheet props (see print/ProformaDoc.jsx and print/EstimateDoc.jsx)
//   downloadEstimatePdf(props)         -> saves "<number>.pdf" from the browser
// The layout follows the printed sheet: letterhead, customer and vehicle, labour and parts, totals with the amount in words, and the terms,
// signatures and footer together at the BOTTOM of the last page. A long estimate is first shrunk a little to fit one page; only if it still
// does not fit does it run on to more pages (the table heading repeats, a draft carries its watermark on every page).
// The built-in PDF font (Helvetica) covers Latin letters, digits and common punctuation; any other character (for example Amharic) prints as "?".
import { TZ, birrInWords, dt, money, pct, splitCode, tot, cur, discNote } from './format.js';
import { DEFAULT_TERMS } from './constants.js';
import { BRAND_LOGOS } from './brands.js';

const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,556,222,556,333,1000,556,556,333,1000,667,333,1000,556,611,556,556,222,222,333,333,350,556,1000,333,1000,500,333,944,556,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,556,278,556,500,1000,556,556,333,1000,667,333,1000,556,611,556,556,278,278,500,500,350,556,1000,333,1000,556,333,944,556,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];   // Helvetica advance widths for characters 32..255 (WinAnsi), per 1000 units

export const A4W = 595.28, A4H = 841.89, M = 34, CW = A4W - 2 * M;
export const COL = { pb: '#1c5fc2', pd: '#123f85', pg: '#4a9a24', pt: '#eef4fd', pl: '#c6d3e8', ps: '#55637d', tx: '#14203a', amber: '#d9a032', amberBg: '#fdf3dc', amberTx: '#8a5a06' };
const FONT = { r: ['F1', W_REG], b: ['F2', W_BOLD], i: ['F3', W_REG], bi: ['F4', W_BOLD] };
const num = v => parseFloat(v) || 0;
const n2 = v => (Math.round(v * 100) / 100).toString();
const rgb = h => [1, 3, 5].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
const dmy = d => (!d ? '' : /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : new Date(d).toLocaleDateString('en-GB', { timeZone: TZ }));

// ---------- text ----------
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
const enc = s => {
  const out = [];
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0);
    out.push(c >= 32 && c <= 126 || c >= 161 && c <= 255 ? c : /\s/.test(ch) || c === 0xa0 ? 32 : CP1252[c] ?? 63);
  }
  return out;
};
const widthOf = (bytes, f, size, cs = 0) => { const t = FONT[f][1]; let w = 0; for (const c of bytes) w += (t[c - 32] ?? 556); return w / 1000 * size + cs * bytes.length; };
export const tw = (s, f, size, cs = 0) => widthOf(enc(s), f, size, cs);
const hex = bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join('');
const clip = (s, f, size, maxW) => { let b = enc(s); if (widthOf(b, f, size) <= maxW) return b; while (b.length > 1 && widthOf([...b, 133], f, size) > maxW) b = b.slice(0, -1); return [...b, 133]; };

// Breaks a text into lines no wider than w (the first line may have its own width); a word longer than a line is cut
export function wrap(s, f, size, w, w1 = w) {
  const lines = []; let line = '';
  for (const word of String(s ?? '').replace(/\s+/g, ' ').trim().split(' ')) {
    if (!word) continue;
    const max = lines.length ? w : w1, tryLine = line ? line + ' ' + word : word;
    if (tw(tryLine, f, size) <= max) { line = tryLine; continue; }
    if (line) { lines.push(line); line = ''; }
    let rest = word;
    while (tw(rest, f, size) > (lines.length ? w : w1)) {
      let k = rest.length; while (k > 1 && tw(rest.slice(0, k), f, size) > (lines.length ? w : w1)) k--;
      lines.push(rest.slice(0, k)); rest = rest.slice(k);
    }
    line = rest;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

// ---------- drawing (y counts from the top of the page) ----------
const Y = y => A4H - y;
const put = (pg, op) => pg.ops.push(op);
export const fillRect = (pg, x, y, w, h, c) => put(pg, `${rgb(c)} rg ${n2(x)} ${n2(Y(y + h))} ${n2(w)} ${n2(h)} re f`);
const strokeRect = (pg, x, y, w, h, c, lw = .5) => put(pg, `${rgb(c)} RG ${lw} w ${n2(x)} ${n2(Y(y + h))} ${n2(w)} ${n2(h)} re S`);
export const hline = (pg, x1, x2, y, c, lw = .4) => put(pg, `${rgb(c)} RG ${lw} w ${n2(x1)} ${n2(Y(y))} m ${n2(x2)} ${n2(Y(y))} l S`);
function rrect(pg, x, y, w, h, r, fill, stroke, lw = .6) {
  const k = .5523 * r, X0 = x, X1 = x + w, Y0 = Y(y), Y1 = Y(y + h);
  const p = `${n2(X0 + r)} ${n2(Y0)} m ${n2(X1 - r)} ${n2(Y0)} l ${n2(X1 - r + k)} ${n2(Y0)} ${n2(X1)} ${n2(Y0 - r + k)} ${n2(X1)} ${n2(Y0 - r)} c ${n2(X1)} ${n2(Y1 + r)} l ${n2(X1)} ${n2(Y1 + r - k)} ${n2(X1 - r + k)} ${n2(Y1)} ${n2(X1 - r)} ${n2(Y1)} c ${n2(X0 + r)} ${n2(Y1)} l ${n2(X0 + r - k)} ${n2(Y1)} ${n2(X0)} ${n2(Y1 + r - k)} ${n2(X0)} ${n2(Y1 + r)} c ${n2(X0)} ${n2(Y0 - r)} l ${n2(X0)} ${n2(Y0 - r + k)} ${n2(X0 + r - k)} ${n2(Y0)} ${n2(X0 + r)} ${n2(Y0)} c h`;
  put(pg, `${rgb(fill)} rg ${rgb(stroke)} RG ${lw} w ${p} B`);
}
export const gradient = (pg, x, y, w, h) => {   // the blue-to-lime rule
  const a = [0x1f, 0x78, 0xee], b = [0x6b, 0xbf, 0x2f], N = 48;
  for (let i = 0; i < N; i++) {
    const c = a.map((v, k) => Math.round(v + (b[k] - v) * i / (N - 1)));
    fillRect(pg, x + w * i / N, y, w / N + .4, h, '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''));
  }
};
// o: f font, size, color, align l|r|c, cs letter spacing
export function text(pg, s, x, y, { f = 'r', size = 9, color = COL.tx, align = 'l', cs = 0, maxW } = {}) {
  let bytes = maxW ? clip(s, f, size, maxW) : enc(s);
  if (!bytes.length) return;
  const w = widthOf(bytes, f, size, cs);
  const x0 = align === 'r' ? x - w : align === 'c' ? x - w / 2 : x;
  put(pg, `BT ${rgb(color)} rg /${FONT[f][0]} ${n2(size)} Tf ${n2(cs)} Tc ${n2(x0)} ${n2(Y(y))} Td <${hex(bytes)}> Tj ET`);
}
function watermark(pg) {   // a faint DRAFT across the page, behind everything
  const size = 118, w = widthOf(enc('DRAFT'), 'b', size, 14), th = 28 * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const lx = -w / 2, ly = -.35 * size, cx = A4W / 2, cy = A4H / 2 - 10;
  put(pg, `q /GS1 gs ${rgb(COL.pb)} rg BT /F2 ${size} Tf 14 Tc ${n2(c)} ${n2(s)} ${n2(-s)} ${n2(c)} ${n2(cx + lx * c - ly * s)} ${n2(cy + lx * s + ly * c)} Tm <${hex(enc('DRAFT'))}> Tj ET Q`);
}
export function logoAt(pg, logo, x, y, size) {   // round, cropped to fill the circle
  const sc = Math.max(size / logo.w, size / logo.h), dw = logo.w * sc, dh = logo.h * sc, r = size / 2, k = .5523 * r, cx = x + r, cy = Y(y + r);
  put(pg, `q ${n2(cx + r)} ${n2(cy)} m ${n2(cx + r)} ${n2(cy + k)} ${n2(cx + k)} ${n2(cy + r)} ${n2(cx)} ${n2(cy + r)} c ${n2(cx - k)} ${n2(cy + r)} ${n2(cx - r)} ${n2(cy + k)} ${n2(cx - r)} ${n2(cy)} c ${n2(cx - r)} ${n2(cy - k)} ${n2(cx - k)} ${n2(cy - r)} ${n2(cx)} ${n2(cy - r)} c ${n2(cx + k)} ${n2(cy - r)} ${n2(cx + r)} ${n2(cy - k)} ${n2(cx + r)} ${n2(cy)} c W n ${n2(dw)} 0 0 ${n2(dh)} ${n2(cx - dw / 2)} ${n2(cy - dh / 2)} cm /${logo.name || 'Im1'} Do Q`);
}

// ---------- the sheet ----------
// s scales every size (1 = normal). Returns the pages, each { ops }.
function layout(d, s, logo, brands = []) {
  const g = d.garage || {}, pages = [], LIMIT = A4H - M - 22;
  let pg, y;
  const run = () => { text(pg, `${d.no} · Service Price Estimation (continued)`, M, M + 7, { size: 7.6, color: COL.ps }); hline(pg, M, M + CW, M + 11, COL.pl); y = M + 18; };
  const newPage = cont => { pg = { ops: [] }; pages.push(pg); if (d.draft) watermark(pg); y = M; if (cont) run(); };
  newPage(false);

  const L = (d.labours || []).map(l => ({ ...l, price: num(l.price) })), P = (d.parts || []).map(p => ({ ...p, qty: num(p.qty), price: num(p.price) }));
  const t = tot({ labours: L, parts: P, disc: d.disc }, d.vat ?? 0.15), c = d.customer || {}, v = d.vehicle || {}, ins = d.insurer;
  const type = ins ? 'Insurance' : d.walkIn ? 'Walk-in customer (private)' : 'Private';

  // the makes we serve: one centred row at the very top (same height for each, so they look even)
  if (brands.length) {
    const bh = 24 * s, bg = 24 * s, ws = brands.map(b => b.w * bh / b.h), row = ws.reduce((a, b) => a + b, 0) + bg * (brands.length - 1);
    let bx = A4W / 2 - row / 2;
    brands.forEach((b, i) => { put(pg, `q ${n2(ws[i])} 0 0 ${n2(bh)} ${n2(bx)} ${n2(Y(y + bh))} cm /${b.name} Do Q`); bx += ws[i] + bg; });
    y += bh + 8 * s;
  }

  // letterhead: logo, garage, document numbers, the blue-to-lime rule
  const logoS = 52 * s, metaW = 172, mx = M + CW - metaW, rh = 12.6 * s;
  if (logo) logoAt(pg, logo, M, y, logoS);
  const tx = M + (logo ? logoS + 10 : 0);
  let ty = y + 12 * s;
  text(pg, g.name, tx, ty, { f: 'b', size: 14 * s, color: COL.pd, maxW: mx - tx - 8 }); ty += 12 * s;
  if (g.brand) { text(pg, g.brand, tx, ty, { f: 'b', size: 8.6 * s, color: COL.ps }); ty += 11 * s; }
  for (const ln of wrap(g.address, 'r', 8 * s, mx - tx - 8)) { text(pg, ln, tx, ty, { size: 8 * s, color: COL.ps }); ty += 10.4 * s; }
  text(pg, `Tel ${g.phone || ''}${g.email ? ` · ${g.email}` : ''}${g.tin ? ` · TIN ${g.tin}` : ''}`, tx, ty, { size: 8 * s, color: COL.ps, maxW: mx - tx - 8 }); ty += 4 * s;
  const meta = [['Date', dmy(d.date)], ['Est. No', d.no], [`${d.label || 'Estimation'} type`, type], ...(d.dueDate ? [['Delivery time', dmy(d.dueDate)]] : [])];
  meta.forEach(([l, val], i) => {
    const by = y + (i + 1) * rh;
    text(pg, l, mx, by - 3.4 * s, { size: 7.8 * s, color: COL.ps });
    text(pg, val, mx + metaW, by - 3.4 * s, { f: 'b', size: 8.4 * s, color: COL.pd, align: 'r', maxW: metaW - 62 });
    hline(pg, mx, mx + metaW, by, COL.pl, .35);
  });
  y = Math.max(y + logoS, ty, y + meta.length * rh) + 4 * s;
  gradient(pg, M, y, CW, 2.6 * s); y += 2.6 * s + 9 * s;

  // title (and the DRAFT chip)
  const title = 'SERVICE PRICE ESTIMATION', ts = 11.2 * s, tcs = 2.2 * s, tW = tw(title, 'b', ts, tcs);
  const chipW = d.draft ? tw('DRAFT', 'b', 7.4 * s, 1.1 * s) + 14 * s : 0, tx0 = A4W / 2 - (tW + (d.draft ? 10 * s + chipW : 0)) / 2;
  text(pg, title, tx0, y + 9 * s, { f: 'b', size: ts, color: COL.pd, cs: tcs });
  if (d.draft) { const cx = tx0 + tW + 10 * s; rrect(pg, cx, y - 1.5 * s, chipW, 14 * s, 7 * s, COL.amberBg, COL.amber, .8); text(pg, 'DRAFT', cx + chipW / 2 + .5 * s, y + 8.4 * s, { f: 'b', size: 7.4 * s, color: COL.amberTx, align: 'c', cs: 1.1 * s }); }
  y += 21 * s;

  // customer + insurance (left), vehicle (right)
  const fr = 13 * s, gap = 22 * s, colW = (CW - gap) / 2, lw = 60 * s;
  const left = [['Customer', c.name], ['Phone', c.phone], ['Address', c.address], ...(c.tin ? [['TIN', c.tin]] : []),
    ...(ins ? [['Insurance', ins.name], ['Ins. address', ins.address], ['Ins. tel', ins.phone], ['Policy no', d.policyNo], ['Claim no', d.claimNo]] : [['Payment', 'Customer pays (no insurance)']])];
  const right = [['Plate no', v.plate], ['Make', v.brand], ['Model', v.model], ['Chassis no', v.vin], ['Engine no', v.eng], ['Colour', v.col], ['Mileage', v.mileage != null && v.mileage !== '' ? `${Number(v.mileage).toLocaleString('en-US')} km` : '']];
  [[left, M, COL.pb], [right, M + colW + gap, COL.pg]].forEach(([rows, x, bar]) => {
    fillRect(pg, x, y, 2.8 * s, rows.length * fr, bar);
    rows.forEach(([l, val], i) => {
      const ry = y + (i + 1) * fr;
      text(pg, l.toUpperCase(), x + 9 * s, ry - 3.6 * s, { size: 6.6 * s, color: COL.ps, cs: .5 * s });
      text(pg, val, x + 9 * s + lw, ry - 3.6 * s, { f: 'b', size: 8.8 * s, maxW: colW - 9 * s - lw - 2 });
      hline(pg, x + 9 * s, x + colW, ry, COL.pl, .35);
    });
  });
  y += Math.max(left.length, right.length) * fr + 6 * s;

  // work description
  { const lab = 'Work description: ', lwd = tw(lab, 'b', 8.8 * s) + 2.5 * s, lines = wrap(d.note || '-', 'r', 8.8 * s, CW, CW - lwd);
    text(pg, lab, M, y + 8.6 * s, { f: 'b', size: 8.8 * s }); lines.forEach((ln, i) => text(pg, ln, i ? M : M + lwd, y + 8.6 * s + i * 10.6 * s, { size: 8.8 * s }));
    y += lines.length * 10.6 * s + 6 * s; }

  // the table
  const cc = { code: 72 * s, qty: 28 * s, unit: 64 * s, amt: 72 * s }, descW = CW - cc.code - cc.qty - cc.unit - cc.amt, pad = 5 * s;
  const xDesc = M + cc.code, xQty = xDesc + descW + cc.qty, xUnit = xQty + cc.unit, xAmt = M + CW;
  const head = () => {
    const h = 14.5 * s; fillRect(pg, M, y, CW, h, COL.pt);
    const b = y + h - 4.6 * s, o = { f: 'b', size: 6.9 * s, color: COL.pd, cs: .5 * s };
    text(pg, 'CODE', M + pad, b, o); text(pg, 'DESCRIPTION', xDesc + pad, b, o); text(pg, 'QTY', xQty - pad, b, { ...o, align: 'r' }); text(pg, 'UNIT PRICE', xUnit - pad, b, { ...o, align: 'r' }); text(pg, `AMOUNT (${cur()})`.toUpperCase(), xAmt - pad, b, { ...o, align: 'r' });
    hline(pg, M, M + CW, y + h, COL.pb, 1); y += h;
  };
  const fs = 8.4 * s, lh = 10.2 * s;
  const rowH = r => Math.max(1, wrap(r.desc, 'r', fs, descW - 2 * pad).length) * lh + 4.6 * s;
  const ensure = h => { if (y + h > LIMIT) { newPage(true); head(); } };
  const group = (name, nextH) => { const h = 12.6 * s; ensure(h + nextH); fillRect(pg, M, y, CW, h, COL.pt); fillRect(pg, M, y, 2.8 * s, h, COL.pg); text(pg, name, M + 8 * s, y + h - 4 * s, { f: 'b', size: 7.4 * s, color: COL.pd, cs: .6 * s }); y += h; };
  const item = r => {
    const lines = wrap(r.desc, 'r', fs, descW - 2 * pad), h = rowH(r); ensure(h);
    const b = y + 2.3 * s + 7.2 * s;
    text(pg, r.code, M + pad, b, { size: 7.6 * s, color: COL.ps, maxW: cc.code - pad });
    lines.forEach((ln, i) => text(pg, ln, xDesc + pad, b + i * lh, { size: fs }));
    if (r.qty !== undefined) { text(pg, String(r.qty), xQty - pad, b, { size: fs, align: 'r' }); text(pg, money(r.unit), xUnit - pad, b, { size: fs, align: 'r' }); }
    text(pg, money(r.amount), xAmt - pad, b, { size: fs, align: 'r' });
    hline(pg, M, M + CW, y + h, COL.pl, .35); y += h;
  };
  const sub = (label, val) => { const h = 13 * s; ensure(h); hline(pg, M, M + CW, y, COL.pb, .6); text(pg, label, xUnit + 0, y + h - 3.8 * s, { f: 'b', size: 8.4 * s, align: 'r', color: COL.tx }); text(pg, val, xAmt - pad, y + h - 3.8 * s, { f: 'b', size: 8.4 * s, align: 'r' }); y += h; };
  head();
  const labRows = L.map(l => { const sp = splitCode(l.desc); return { code: sp.code, desc: sp.text, amount: l.price }; });
  const partRows = P.map(p => ({ code: p.code, desc: p.name, qty: p.qty, unit: p.price, amount: p.qty * p.price }));
  if (!labRows.length && !partRows.length) item({ code: '', desc: 'No items.', amount: undefined });
  if (labRows.length) { group('LABOUR', rowH(labRows[0])); labRows.forEach(item); sub('Total for Labour', money(t.l)); }
  if (partRows.length) { group('OTHER CHARGES (PARTS AND MATERIALS)', rowH(partRows[0])); partRows.forEach(item); sub('Total for Other Charges', money(t.p)); }
  y += 7 * s;

  // totals, amount in words, remark
  const totW = 196 * s, tr = 12.6 * s, grandH = 17 * s, totRows = [['Total Est. Amount', t.sub], ...(t.disc ? [['Referral discount', -t.disc]] : []), [`${pct(t.rate)}% VAT`, t.vat]], totH = totRows.length * tr + grandH;
  const wordLines = wrap(`** ${birrInWords(t.total)} ***`, 'i', 8.4 * s, CW - 16 * s), wordsH = wordLines.length * 10.4 * s + 6 * s;
  const discLines = t.disc ? wrap(discNote(t.discRef), 'i', 8.4 * s, CW) : [], discH = discLines.length ? discLines.length * 10.4 * s + 5 * s : 0;   // why the discount was given
  const remLines = d.terms ? wrap(`REMARK: ${d.terms}`, 'r', 8.4 * s, CW) : [], remH = remLines.length ? remLines.length * 10.4 * s + 5 * s : 0;

  // the terms, slogan, signatures: one block that sits at the bottom of the last page
  const terms = [...DEFAULT_TERMS, ...(g.bank ? [`Bank account: ${g.bank}`] : []), ...(g.tin ? [`TIN: ${g.tin}`] : [])];
  const ts2 = 7.4 * s, tl = 9 * s, termW = CW - 14 * s - 12 * s;
  const termLines = terms.map(x => wrap(x, 'r', ts2, termW));
  const termsH = 7 * s + 9.4 * s + termLines.reduce((a, l) => a + l.length * tl + .8 * s, 0) + 5 * s;
  const sigH = 44 * s, tailH = termsH + 7 * s + 11 * s + 5 * s + sigH;
  const endH = totH + 6 * s + wordsH + (discH ? 4 * s + discH : 0) + (remH ? 4 * s + remH : 0);

  if (y + endH + 8 * s + tailH > LIMIT) newPage(true);   // totals travel to the last page together with the terms and signatures

  const tx1 = M + CW - totW;
  strokeRect(pg, tx1, y, totW, totH, COL.pl, .5);
  totRows.forEach(([l, val], i) => { const by = y + (i + 1) * tr - 3.8 * s; text(pg, l, tx1 + 7 * s, by, { f: 'b', size: 8.6 * s }); text(pg, money(val), tx1 + totW - 7 * s, by, { f: 'b', size: 8.6 * s, align: 'r' }); });
  fillRect(pg, tx1, y + totRows.length * tr, totW, grandH, COL.pt); hline(pg, tx1, tx1 + totW, y + totRows.length * tr, COL.pb, 1.3);
  text(pg, 'Total Inc. VAT', tx1 + 7 * s, y + totH - 5 * s, { f: 'b', size: 10 * s, color: COL.pd }); text(pg, money(t.total), tx1 + totW - 7 * s, y + totH - 5 * s, { f: 'b', size: 10 * s, color: COL.pd, align: 'r' });
  y += totH + 6 * s;
  fillRect(pg, M, y, CW, wordsH, COL.pt); fillRect(pg, M, y, 3.4 * s, wordsH, COL.pg);
  wordLines.forEach((ln, i) => text(pg, ln, M + 10 * s, y + 3 * s + 7.6 * s + i * 10.4 * s, { f: 'i', size: 8.4 * s, color: COL.pd }));
  y += wordsH;
  if (discLines.length) { y += 4 * s; discLines.forEach((ln, i) => text(pg, ln, M, y + 7.6 * s + i * 10.4 * s, { f: 'i', size: 8.4 * s })); y += discLines.length * 10.4 * s + 1 * s; }
  if (remLines.length) { y += 4 * s; remLines.forEach((ln, i) => { if (!i) { text(pg, 'REMARK:', M, y + 7.6 * s, { f: 'b', size: 8.4 * s }); text(pg, ln.replace(/^REMARK:\s*/, ''), M + tw('REMARK: ', 'b', 8.4 * s), y + 7.6 * s, { size: 8.4 * s }); } else text(pg, ln, M, y + 7.6 * s + i * 10.4 * s, { size: 8.4 * s }); }); y += remH - 4 * s; }

  // tail, anchored to the bottom
  let by = LIMIT - tailH;
  strokeRect(pg, M, by, CW, termsH, COL.pl, .5); fillRect(pg, M, by, CW, 2.2 * s, COL.pb);
  text(pg, 'TERMS AND CONDITION:', M + 8 * s, by + 2.2 * s + 8.4 * s, { f: 'b', size: 7.2 * s, color: COL.pd, cs: .8 * s });
  let ly = by + 2.2 * s + 8.4 * s + 2.6 * s;
  termLines.forEach((lines, i) => { text(pg, `${i + 1}.`, M + 12 * s, ly + 7 * s, { size: ts2, align: 'r' }); lines.forEach((ln, k) => { text(pg, ln, M + 16 * s, ly + 7 * s + k * tl, { size: ts2 }); }); ly += lines.length * tl + .8 * s; });
  by += termsH + 7 * s;
  text(pg, g.motto || '', A4W / 2, by + 8 * s, { f: 'bi', size: 8.8 * s, color: COL.pd, align: 'c', cs: .9 * s });
  by += 11 * s + 5 * s;
  const sw = (CW - 2 * 28 * s) / 3;
  [['Prepared by', d.preparedBy, d.preparedRole], ['Checked by', '', ''], ['Approved by', '', '']].forEach(([lab, name, role], i) => {
    const x = M + i * (sw + 28 * s);
    if (name) text(pg, name, x + sw / 2, by + 18 * s, { f: 'b', size: 8.6 * s, align: 'c', maxW: sw });
    hline(pg, x, x + sw, by + 22 * s, COL.ps, .7);
    text(pg, lab, x + sw / 2, by + 33 * s, { f: 'b', size: 8.4 * s, color: COL.pd, align: 'c' });
    if (role) text(pg, role, x + sw / 2, by + 42 * s, { size: 7.4 * s, color: COL.ps, align: 'c' });
  });
  return pages;
}

// ---------- the PDF file ----------
const enc8 = new TextEncoder();
export function assemble(pages, { title, images = [], footer }) {
  const total = pages.length, objs = [], str = s => enc8.encode(s);
  const FIX = 8 + images.length;                 // fixed objects: catalog, pages, 4 fonts, extgstate, info, then the images
  const pageId = i => FIX + 2 + i * 2, contId = i => FIX + 1 + i * 2;
  objs.push(str('<< /Type /Catalog /Pages 2 0 R >>'));
  objs.push(str(`<< /Type /Pages /Count ${total} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
  for (const f of ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique']) objs.push(str(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  objs.push(str('<< /Type /ExtGState /ca 0.07 /CA 0.07 >>'));
  objs.push(str(`<< /Title <FEFF${[...title].map(ch => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('')}> /Producer (MG Auto) /Creator (MG Auto) >>`));
  for (const im of images) objs.push(concat([str(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`), im.data, str('\nendstream')]));
  const res = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> /ExtGState << /GS1 7 0 R >>${images.length ? ` /XObject << ${images.map((im, i) => `/${im.name} ${9 + i} 0 R`).join(' ')} >>` : ''} >>`;
  pages.forEach((pg, i) => {
    const ops = [...pg.ops]; const extra = { ops: [] }; footer(extra, i + 1, total); ops.push(...extra.ops);
    const body = str(ops.join('\n'));
    objs.push(concat([str(`<< /Length ${body.length} >>\nstream\n`), body, str('\nendstream')]));
    objs.push(str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4W} ${A4H}] /Resources ${res} /Contents ${contId(i)} 0 R >>`));
  });
  const parts = [str('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')], offs = []; let pos = parts[0].length;
  objs.forEach((o, i) => { offs.push(pos); const a = str(`${i + 1} 0 obj\n`), b = str('\nendobj\n'); parts.push(a, o, b); pos += a.length + o.length + b.length; });
  const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offs.map(o => String(o).padStart(10, '0') + ' 00000 n '), 'trailer', `<< /Size ${objs.length + 1} /Root 1 0 R /Info 8 0 R >>`, 'startxref', String(pos), '%%EOF\n'].join('\n');
  parts.push(str(xref));
  return concat(parts);
}
function concat(parts) { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }

/** props: the EstimationSheet props (no, date, draft, walkIn, customer, vehicle, insurer, policyNo, claimNo, dueDate, note, labours, parts, vat, terms,
 *  garage (already merged with the defaults), preparedBy, preparedRole, label). logo: { data: JPEG bytes, w, h } or nothing. brands: a list of the same shape (Toyota, BYD, Suzuki), drawn in a row above the letterhead. */
export function buildEstimatePdf(props, { logo = null, brands = [], printed = Date.now() } = {}) {
  if (logo) logo = { ...logo, name: 'Im1' };
  brands = brands.map((b, i) => ({ ...b, name: `Im${i + 2}` }));
  const images = [logo, ...brands].filter(Boolean);
  let pages = null;
  for (const s of [1, .94, .88, .82]) { const p = layout(props, s, logo, brands); if (p.length === 1) { pages = p; break; } }   // shrink a little to keep it on ONE page
  if (!pages) pages = layout(props, 1, logo, brands);
  const g = props.garage || {};
  const footer = (pg, n, total) => {
    const y = A4H - M - 22 + 8;
    gradient(pg, M, y, CW, 1.3);
    text(pg, `${g.name || ''}${g.phone ? ` · ${g.phone}` : ''}`, M, y + 11, { size: 7.4, color: COL.ps });
    text(pg, `Printed ${dt(printed)}`, A4W / 2, y + 11, { size: 7.4, color: COL.ps, align: 'c' });
    text(pg, `Page ${n} of ${total}`, M + CW, y + 11, { size: 7.4, color: COL.ps, align: 'r' });
  };
  return assemble(pages, { title: `${props.no || 'Estimation'}${props.draft ? ' (draft)' : ''}`, images, footer });
}

async function loadJpeg(url, max = 360) {   // a picture as a small JPEG on white; null if it cannot be read (so the PDF is still made without it)
  try {
    const res = await fetch(url); if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', .9));
    return { data: new Uint8Array(await blob.arrayBuffer()), w, h };
  } catch { return null; }
}
export const loadLogo = () => loadJpeg('/madeg-logo.png');

export async function downloadEstimatePdf(props) {
  const brands = (await Promise.all(BRAND_LOGOS.map(b => loadJpeg(b.src, 480)))).filter(Boolean);
  const bytes = buildEstimatePdf(props, { logo: await loadLogo(), brands });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${String(props.no || 'estimation').replace(/[^\w.-]+/g, '_')}${props.draft ? '-draft' : ''}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
