import { Btn, Table } from './ui.jsx';
import { SECTIONS, SECTION_CODE, sectionOption } from '../lib/constants.js';
import { matchPart, money } from '../lib/format.js';
import PartSearch from './PartSearch.jsx';

const r2 = n => Math.round(n * 100) / 100;
const num = v => parseFloat(v) || 0;
const key = s => (s || '').trim().toLowerCase();
// A typed text points to a task of the list: "BP · Panel beating" (as the list shows it) or just the name
export const matchTask = (tasks, text) => (key(text) ? (tasks || []).find(t => key(`${SECTION_CODE[t.section]} · ${t.name}`) === key(text) || key(t.name) === key(text)) : undefined);

// Editable labour lines for a proforma or an estimate. Pick a task from the list (BP / ME / SV): its section, hours and cost fill themselves.
// Or type any work by hand. Hours x labour rate fills a cost that is left empty; every cost can be typed over.
export function LabourLines({ labs, setLabs, tasks, rate }) {
  const set = (i, patch) => setLabs(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const typed = (i, text) => {
    const t = matchTask(tasks, text);
    set(i, t ? { desc: t.name, section: t.section, hours: t.hours || '', price: t.price || r2(t.hours * rate) || '' } : { desc: text });
  };
  return (
    <>
      <Table head={['Task (pick from the list or type)', 'Section', 'Hours', 'Cost (ETB)', '']} empty={!labs.length && 'No labour yet.'}>
        {labs.map((l, i) => (
          <tr key={i}>
            <td><input aria-label="Labour task" list="task-list" autoComplete="off" value={l.desc} onChange={x => typed(i, x.target.value)} /></td>
            <td><select aria-label="Section" value={l.section || 'Mechanical Repairs'} onChange={x => set(i, { section: x.target.value })} style={{ width: 'auto' }}>{SECTIONS.map(s => <option key={s} value={s}>{sectionOption(s)}</option>)}</select></td>
            <td><input aria-label="Hours" type="number" min="0" step="0.25" style={{ width: 90 }} value={l.hours ?? ''} onChange={x => set(i, { hours: x.target.value, price: r2(num(x.target.value) * rate) || '' })} /></td>
            <td><input aria-label="Labour cost" type="number" min="0" step="any" style={{ width: 120 }} value={l.price ?? ''} onChange={x => set(i, { price: x.target.value })} /></td>
            <td><Btn kind="ol" onClick={() => setLabs(ls => ls.filter((_, k) => k !== i))}>Remove</Btn></td>
          </tr>
        ))}
      </Table>
      <datalist id="task-list">{(tasks || []).map(t => <option key={t.id} value={`${SECTION_CODE[t.section]} · ${t.name}`}>{t.hours} h</option>)}</datalist>
      <div className="mt"><Btn kind="ol" onClick={() => setLabs(ls => [...ls, { desc: '', section: 'Mechanical Repairs', hours: '', price: '' }])}>Add labour line</Btn> <span className="mu small">Hours x {rate}/h fills the cost; type another amount to change it.</span></div>
    </>
  );
}

// Editable part lines. A part from the stock list fills its name, code and price; anything else is free text with a typed price.
export function PartLines({ parts, setParts, stock }) {
  const set = (i, patch) => setParts(ps => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const typed = (i, text) => {
    const p = matchPart(stock, text);
    setParts(ps => ps.map((x, k) => (k !== i ? x : p ? { ...x, name: p.name, pid: p.id, code: p.code, price: p.price } : { name: text, qty: x.qty, price: x.pid ? '' : x.price })));
  };
  const picked = (i, p) => setParts(ps => ps.map((x, k) => (k !== i ? x : { ...x, name: p.name, pid: p.id, code: p.code, price: p.price })));
  return (
    <>
      <Table head={['Part (type the part number or description)', 'Qty', 'Selling price', 'Total', '']} empty={!parts.length && 'No parts yet.'}>
        {parts.map((p, i) => (
          <tr key={i}>
            <td style={{ minWidth: 280 }}><PartSearch aria-label="Part" stock={stock} value={p.pid ? `${p.code} · ${p.name}` : p.name} onChange={text => typed(i, text)} onPick={x => picked(i, x)} /></td>
            <td><input aria-label="Quantity" type="number" min="0.01" step="any" style={{ width: 80 }} value={p.qty ?? ''} onChange={x => set(i, { qty: x.target.value })} /></td>
            <td><input aria-label="Selling price" type="number" min="0" step="any" style={{ width: 120 }} value={p.price ?? ''} onChange={x => set(i, { price: x.target.value })} /></td>
            <td className="r">{money(num(p.qty) * num(p.price))}</td>
            <td><Btn kind="ol" onClick={() => setParts(ps => ps.filter((_, k) => k !== i))}>Remove</Btn></td>
          </tr>
        ))}
      </Table>
      <div className="mt"><Btn kind="ol" onClick={() => setParts(ps => [...ps, { name: '', qty: 1, price: '' }])}>Add part line</Btn> <span className="mu small">A part from the stock list fills its price. Stock is not touched until the job card is created or the estimate is loaded.</span></div>
    </>
  );
}

// Read-only versions (finalized estimate, issued proforma printed view)
export const labourTotal = labs => labs.reduce((a, l) => a + num(l.price), 0);
