import { Btn, Table } from './ui.jsx';
import { SECTIONS, SECTION_CODE, sectionOption } from '../lib/constants.js';
import { matchPart, money, rateOf } from '../lib/format.js';
import PartSearch from './PartSearch.jsx';
import { groupHours, groupLabel, groupLines, groupTasks, matchGroup } from '../lib/labourGroups.js';

const r2 = n => Math.round(n * 100) / 100;
const num = v => parseFloat(v) || 0;
const key = s => (s || '').trim().toLowerCase();
// A typed text points to a task of the list: "BP · Panel beating" (as the list shows it) or just the name
// A line from the Excel price book is shown with its code and model group ("BP-BR101A · Apron, Repair - One Side · Suzuki"): the same description exists under several codes and models
export const taskLabel = t => (t.code ? `${t.code} · ${t.name}${t.model_grp ? ' · ' + t.model_grp : ''}` : `${SECTION_CODE[t.section]} · ${t.name}`);
export const taskDesc = t => (t.code ? `${t.name} (${t.code})` : t.name);
export const matchTask = (tasks, text) => (key(text) ? (tasks || []).find(t => key(taskLabel(t)) === key(text) || (!t.code && key(t.name) === key(text))) : undefined);

// Editable labour lines for a proforma or an estimate. Pick a task from the list (BP / ME / SV): its section, hours and cost fill themselves.
// Or type any work by hand. Hours x labour rate fills a cost that is left empty; every cost can be typed over.
export function LabourLines({ labs, setLabs, tasks, rate }) {
  const set = (i, patch) => setLabs(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const groups = groupTasks(tasks);
  const typed = (i, text) => {
    // a task picked by its name brings all its lines: they replace this line
    const g = matchGroup(groups, text);
    if (g) return setLabs(ls => [...ls.slice(0, i), ...groupLines(g, rate), ...ls.slice(i + 1)]);
    const t = matchTask(tasks.filter(x => !x.task), text);
    set(i, t ? { desc: taskDesc(t), section: t.section, hours: t.hours || '', price: t.price || r2(t.hours * rateOf(rate, t.section)) || '' } : { desc: text });
  };
  return (
    <>
      <Table head={['Task (search by task name, or type)', 'Section', 'Hours', 'Cost (ETB)', '']} empty={!labs.length && 'No labour yet.'}>
        {labs.map((l, i) => (
          <tr key={i}>
            <td><input aria-label="Labour task" list="task-list" autoComplete="off" value={l.desc} onChange={x => typed(i, x.target.value)} /></td>
            <td><select aria-label="Section" value={l.section || 'Mechanical Repairs'} onChange={x => set(i, { section: x.target.value })} style={{ width: 'auto' }}>{SECTIONS.map(s => <option key={s} value={s}>{sectionOption(s)}</option>)}</select></td>
            <td><input aria-label="Hours" type="number" min="0" step="0.25" style={{ width: 90 }} value={l.hours ?? ''} onChange={x => set(i, { hours: x.target.value, price: r2(num(x.target.value) * rateOf(rate, l.section || 'Mechanical Repairs')) || '' })} /></td>
            <td><input aria-label="Labour cost" type="number" min="0" step="any" style={{ width: 120 }} value={l.price ?? ''} onChange={x => set(i, { price: x.target.value })} /></td>
            <td><Btn kind="ol" onClick={() => setLabs(ls => ls.filter((_, k) => k !== i))}>Remove</Btn></td>
          </tr>
        ))}
      </Table>
      <datalist id="task-list">{groups.map(g => <option key={g.name} value={groupLabel(g)}>{groupHours(g)} h · all lines</option>)}{(tasks || []).filter(t => !t.task).map(t => <option key={t.id} value={taskLabel(t)}>{t.hours} h</option>)}</datalist>
      <div className="mt"><Btn kind="ol" onClick={() => setLabs(ls => [...ls, { desc: '', section: 'Mechanical Repairs', hours: '', price: '' }])}>Add labour line</Btn> <span className="mu small">Hours x the section's rate ({SECTIONS.map(s => `${SECTION_CODE[s]} ${rateOf(rate, s)}`).join(' · ')} ETB/h) fills the cost; type another amount to change it.</span></div>
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
