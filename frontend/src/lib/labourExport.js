// The registered labour list (every labour task on the Labour list tab) as an Excel sheet and as a PDF.
//   labourRows(tasks, rates)        -> [{ section, code, task, line, model, hours, rate, cost, fixed }]  sorted by section, task, line
//   labourSummary(rows)             -> { count, hours, cost, bySection: [{ section, code, count, hours, cost }] }
//   downloadLabourXlsx(tasks, rates)  /  downloadLabourPdf(tasks, rates)
// Cost of a line = its fixed price when one is set, otherwise hours x the labour rate of its section (the same rule the list shows).
import { SECTIONS, SECTION_CODE } from './constants.js';
import { cur, dt, money, rateOf, today } from './format.js';
import { downloadXlsx } from './xlsx.js';
import { A4H, A4W, CW, COL, M, assemble, fillRect, gradient, hline, loadLogo, logoAt, text, tw, wrap } from './estimatePdf.js';

const r2 = n => Math.round(n * 100) / 100;
const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });

export function labourRows(tasks, rates) {
  const secNo = s => { const i = SECTIONS.indexOf(s); return i < 0 ? 99 : i; };
  return [...(tasks || [])].map(t => {
    const hours = +t.hours || 0, rate = rateOf(rates, t.section);
    return { section: t.section, code: t.code || '', task: t.task || '', line: t.name || '', model: t.model_grp || '', hours, rate, fixed: !!+t.price, cost: +t.price || r2(hours * rate) };
  }).sort((a, b) => secNo(a.section) - secNo(b.section) || cmp(a.task, b.task) || cmp(a.code, b.code) || cmp(a.line, b.line));
}

export function labourSummary(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.section)) by.set(r.section, { section: r.section, code: SECTION_CODE[r.section] || '', count: 0, hours: 0, cost: 0 });
    const s = by.get(r.section); s.count++; s.hours = r2(s.hours + r.hours); s.cost = r2(s.cost + r.cost);
  }
  const bySection = [...by.values()].sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section));
  return { count: rows.length, hours: r2(rows.reduce((a, r) => a + r.hours, 0)), cost: r2(rows.reduce((a, r) => a + r.cost, 0)), bySection };
}

const stamp = () => today();

// ---------- Excel ----------
export function labourXlsxRows(rows) {
  const sum = labourSummary(rows);
  return [
    ['No', 'Section', 'Labour Code', 'Task', 'Labour Line', 'Model Grp', 'Hours', `Rate (${cur()}/h)`, `Total Cost (${cur()})`],
    ...rows.map((r, i) => [i + 1, `${SECTION_CODE[r.section] || ''} ${r.section}`.trim(), r.code, r.task, r.line, r.model, r.hours, r.fixed ? 'fixed price' : r.rate, r.cost]),
    [],
    ['', 'TOTAL', '', '', `${sum.count} labour lines registered`, '', sum.hours, '', sum.cost],
    ...sum.bySection.map(s => ['', `${s.code} ${s.section}`, '', '', `${s.count} lines`, '', s.hours, '', s.cost])
  ];
}
export const downloadLabourXlsx = (tasks, rates) => downloadXlsx(`labour-list-${stamp()}.xlsx`, labourXlsxRows(labourRows(tasks, rates)), 'Labour list');

// ---------- PDF ----------
// columns: x offset, width, align
const COLS = [
  { k: 'no', t: 'No', w: 26, a: 'r' }, { k: 'code', t: 'Code', w: 62 }, { k: 'line', t: 'Task / labour line', w: 0 },
  { k: 'model', t: 'Model', w: 84 }, { k: 'hours', t: 'Hours', w: 40, a: 'r' }, { k: 'cost', t: `Cost (${cur()})`, w: 70, a: 'r' }
];

export function buildLabourPdf(rows, { logo = null, printed = Date.now() } = {}) {
  if (logo) logo = { ...logo, name: 'Im1' };
  const sum = labourSummary(rows), pages = [];
  const fixed = COLS.reduce((a, c) => a + c.w, 0), pad = 4;
  let x = M; const cols = COLS.map(c => { const w = c.w || CW - fixed; const o = { ...c, w, x }; x += w; return o; });
  const FOOT = A4H - M - 14, rowH = 15, size = 8;
  let pg = null, y = 0;

  const header = first => {
    pg = { ops: [] }; pages.push(pg); y = M;
    if (first) {
      if (logo) logoAt(pg, logo, M, y, 40);
      const tx = logo ? M + 50 : M;
      text(pg, 'Labour list', tx, y + 17, { f: 'b', size: 18, color: COL.pd });
      text(pg, `All registered labour tasks · printed ${dt(printed)}`, tx, y + 32, { size: 8.5, color: COL.ps });
      y += 50; gradient(pg, M, y, CW, 1.6); y += 12;
      // summary boxes: total + one per section
      const boxes = [{ label: 'Total registered', n: `${sum.count}`, sub: `${sum.hours} h · ${money(sum.cost)} ${cur()}` }, ...sum.bySection.map(s => ({ label: `${s.code} · ${s.section}`, n: `${s.count}`, sub: `${s.hours} h · ${money(s.cost)} ${cur()}` }))];
      const gap = 8, bw = (CW - gap * (boxes.length - 1)) / boxes.length;
      boxes.forEach((b, i) => {
        const bx = M + i * (bw + gap);
        fillRect(pg, bx, y, bw, 52, COL.pt);
        fillRect(pg, bx, y, 3, 52, i === 0 ? COL.pb : COL.pg);
        text(pg, b.label, bx + 10, y + 13, { size: 7.5, color: COL.ps, maxW: bw - 14 });
        text(pg, b.n, bx + 10, y + 34, { f: 'b', size: 18, color: COL.tx });
        text(pg, b.sub, bx + 10, y + 46, { size: 7, color: COL.ps, maxW: bw - 14 });
      });
      y += 52 + 14;
    }
    // table heading (repeats on every page)
    fillRect(pg, M, y, CW, rowH + 2, COL.pb);
    for (const c of cols) text(pg, c.t, c.a === 'r' ? c.x + c.w - pad : c.x + pad, y + 11.5, { f: 'b', size, color: '#ffffff', align: c.a === 'r' ? 'r' : 'l', maxW: c.w - 2 * pad });
    y += rowH + 2;
  };
  const room = h => y + h <= FOOT - 6;

  header(true);
  let section = null, n = 0;
  for (const r of rows) {
    if (r.section !== section) {
      section = r.section;
      if (!room(rowH * 2)) header(false);
      fillRect(pg, M, y, CW, rowH, COL.pl);
      text(pg, `${SECTION_CODE[section] || ''} · ${section}`, M + pad, y + 10.5, { f: 'b', size: 8.5, color: COL.pd });
      const s = sum.bySection.find(z => z.section === section);
      text(pg, `${s.count} lines · ${s.hours} h · ${money(s.cost)} ${cur()}`, M + CW - pad, y + 10.5, { f: 'b', size: 8, color: COL.pd, align: 'r' });
      y += rowH;
    }
    n++;
    const lineW = cols[2].w - 2 * pad, txt = r.task ? `${r.task}: ${r.line}` : r.line, ls = wrap(txt, 'r', size, lineW), h = Math.max(rowH, ls.length * 10 + 5);
    if (!room(h)) header(false);
    if (n % 2 === 0) fillRect(pg, M, y, CW, h, '#f7f9fd');
    const base = y + 10.5;
    text(pg, String(n), cols[0].x + cols[0].w - pad, base, { size, color: COL.ps, align: 'r' });
    text(pg, r.code, cols[1].x + pad, base, { size, maxW: cols[1].w - 2 * pad });
    ls.forEach((l, i) => text(pg, l, cols[2].x + pad, base + i * 10, { size }));
    text(pg, r.model, cols[3].x + pad, base, { size, maxW: cols[3].w - 2 * pad });
    text(pg, String(r.hours), cols[4].x + cols[4].w - pad, base, { size, align: 'r' });
    text(pg, money(r.cost), cols[5].x + cols[5].w - pad, base, { size, align: 'r' });
    hline(pg, M, M + CW, y + h, COL.pl, .3);
    y += h;
  }
  if (!rows.length) text(pg, 'No labour tasks registered yet.', M + pad, y + 14, { size: 9, color: COL.ps });
  else {   // grand total
    if (!room(rowH + 8)) header(false);
    y += 4; fillRect(pg, M, y, CW, rowH + 2, COL.pd);
    text(pg, `TOTAL · ${sum.count} labour lines`, M + pad, y + 11.5, { f: 'b', size: 8.5, color: '#ffffff' });
    text(pg, String(sum.hours), cols[4].x + cols[4].w - pad, y + 11.5, { f: 'b', size: 8.5, color: '#ffffff', align: 'r' });
    text(pg, money(sum.cost), cols[5].x + cols[5].w - pad, y + 11.5, { f: 'b', size: 8.5, color: '#ffffff', align: 'r' });
  }

  const footer = (p, i, total) => {
    const fy = A4H - M - 14;
    gradient(p, M, fy, CW, 1.2);
    text(p, 'MG Auto · Labour list', M, fy + 11, { size: 7.4, color: COL.ps });
    text(p, `Page ${i} of ${total}`, M + CW, fy + 11, { size: 7.4, color: COL.ps, align: 'r' });
  };
  return assemble(pages, { title: 'Labour list', images: logo ? [logo] : [], footer });
}

export async function downloadLabourPdf(tasks, rates) {
  const bytes = buildLabourPdf(labourRows(tasks, rates), { logo: await loadLogo() });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = `labour-list-${stamp()}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
