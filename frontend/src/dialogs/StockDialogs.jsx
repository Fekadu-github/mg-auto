// Parts stock dialogs: edit an item (manager), import from Excel, change all prices, and the GRN (parts bought and added to stock).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Table, useForm } from '../components/ui.jsx';
import PartSearch from '../components/PartSearch.jsx';
import { isMgr } from '../lib/constants.js';
import { money, r2 } from '../lib/format.js';
import { MAKES, makeOf, priceFromCost, readItemsFile, templateRows } from '../lib/stock.js';
import { downloadXlsx } from '../lib/xlsx.js';
import { usePrint } from '../print/PrintHost.jsx';
import { clearDraft, usePersistedForm, usePersistedState } from '../lib/autosave.js';
import GrnDoc from '../print/GrnDoc.jsx';

const num = v => parseFloat(v) || 0;

// ---- edit one item: the manager changes description, category, cost, price and reorder level ----
export function EditPartDialog({ id }) {
  const { db, run, closeModal } = useApp(), p = db.p.find(x => x.id === id) || {};
  const [f, bind, set] = useForm({ name: p.name || '', category: p.category || '', cost: p.cost ?? 0, price: p.price ?? 0, reorder: p.reorder ?? 0 });
  const onCost = e => set({ cost: e.target.value, ...(e.target.value !== '' && { price: priceFromCost(e.target.value, db.cfg.markup) }) });   // typing a cost fills the price
  const save = async () => { const r = await run(() => api('/inventory/' + id, 'PUT', { name: f.name, category: f.category, cost: f.cost, price: f.price, reorder: f.reorder })); if (r.ok) closeModal(); };
  const retire = async () => { if (!confirm('Remove this part from the stock list? Its history is kept.')) return; const r = await run(() => api('/inventory/' + id, 'PUT', { active: false })); if (r.ok) closeModal(); };
  return (
    <Dialog title={`Edit ${p.code}`} onClose={closeModal} actions={<><Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={retire}>Retire part</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <p className="mu small">{makeOf(p.code) ? `${makeOf(p.code)} part.` : ''} The part number cannot be changed. The quantity changes through a purchase (GRN), a sale, a job card or a stock count.</p>
      <div className="row mt">
        <Field label="Description" grow="3 1 200px" {...bind('name')} /><Field label="Category" {...bind('category')} />
        <Field label="Cost (ETB)" type="number" min="0" step="any" value={f.cost} onChange={onCost} />
        <Field label={`Price (ETB, before VAT) · cost x ${db.cfg.markup}`} type="number" min="0" step="any" {...bind('price')} />
        <Field label="Reorder level" type="number" min="0" step="any" {...bind('reorder')} />
      </div>
      <p className="mu small">Typing the cost fills the price (cost x {db.cfg.markup}); type another price to override it. A price change applies to sales and job cards from now on; lines already on job cards keep their price.</p>
    </Dialog>
  );
}

// ---- import items from an Excel (.xlsx) or .csv file ----
export function ImportDialog() {
  const { run, say, closeModal } = useApp();
  const [rows, setRows] = useState(null), [check, setCheck] = useState(null), [busy, setBusy] = useState(false), [name, setName] = useState('');
  const choose = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setCheck(null); setName(file.name);
    try {
      const data = await readItemsFile(file);
      if (!data.length) throw new Error('The file has no rows under its header line.');
      setRows(data);
      setCheck(await api('/inventory/import', 'POST', { rows: data, apply: false }));
    } catch (x) { setRows(null); say(x.message); }
    setBusy(false);
  };
  const apply = async () => {
    setBusy(true);
    const r = await run(() => api('/inventory/import', 'POST', { rows, apply: true }));
    setBusy(false);
    if (r.ok) { say(`Imported: ${r.data.created} new, ${r.data.updated} updated${r.data.errorCount ? `, ${r.data.errorCount} row(s) skipped` : ''}.`); closeModal(); }
  };
  const total = check ? check.created + check.updated : 0;
  return (
    <Dialog title="Import items from Excel" onClose={closeModal} actions={<><Btn onClick={apply} disabled={busy || !total}>Import {total || ''} item{total === 1 ? '' : 's'}</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <p className="mu">Choose an Excel (.xlsx) or .csv file. The first row must be the headers: <b>Part number, Description, Quantity, Cost, Price</b> and optionally Category and Reorder level. Other header spellings (Qty, Part No, Unit cost…) are understood too.</p>
      <ul className="mu small">
        <li>A new part number must start with S (Suzuki), T (Toyota) or B (BYD).</li>
        <li>If the price column is empty or missing, the price is filled as cost x 1.3.</li>
        <li>A part number that already exists is updated; its quantity becomes the quantity in the file (like a stock count).</li>
      </ul>
      <div className="row mt">
        <Field label="File"><input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} disabled={busy} /></Field>
        <Btn kind="ol" onClick={() => downloadXlsx('inventory-template.xlsx', templateRows(), 'Inventory')}>Download an empty template</Btn>
      </div>
      {busy && !check && <p className="mu">Reading {name}…</p>}
      {check && <>
        <div className="box mt"><b>{name}</b>: {check.created} new, {check.updated} to update{check.errorCount ? <>, <span style={{ color: 'var(--rd)' }}>{check.errorCount} row(s) with problems (they will be skipped)</span></> : ''}.</div>
        {check.preview.length > 0 && <div className="mt"><Table head={['Row', 'Part number', 'Description', 'What', { t: 'Qty', r: 1 }, { t: 'Cost', r: 1 }, { t: 'Price', r: 1 }]}>
          {check.preview.map(i => <tr key={i.code}><td>{i.line}</td><td><b>{i.code}</b></td><td>{i.name}</td><td>{i.action === 'new' ? 'new' : 'update'}</td><td className="r">{i.qty ?? ''}</td><td className="r">{i.cost !== undefined ? money(i.cost) : ''}</td><td className="r">{i.price !== undefined ? money(i.price) : ''}</td></tr>)}
        </Table>{total > check.preview.length && <p className="mu small">Showing the first {check.preview.length} of {total}.</p>}</div>}
        {check.errors.length > 0 && <div className="mt"><h3>Rows with problems</h3><Table head={['Row', 'Part number', 'Problem']}>
          {check.errors.map((x, i) => <tr key={i}><td>{x.line}</td><td>{x.code}</td><td>{x.error}</td></tr>)}
        </Table></div>}
      </>}
    </Dialog>
  );
}

// ---- change all prices by the same percentage ----
export function BulkPriceDialog() {
  const { db, run, say, closeModal } = useApp();
  const [f, bind] = useForm({ percent: '', make: '' });
  const pct = parseFloat(f.percent), ok = Number.isFinite(pct) && pct !== 0 && pct > -90 && pct <= 1000;
  const count = db.p.filter(p => !f.make || p.code.toUpperCase().startsWith(f.make)).length;
  const apply = async () => {
    if (!confirm(`Change ${count} price(s) by ${pct > 0 ? '+' : ''}${pct}%?\n\nEvery change is written in the part's history. To undo it, change by the opposite percentage.`)) return;
    const r = await run(() => api('/inventory/bulk-price', 'POST', { percent: pct, make: f.make }));
    if (r.ok) { say(`${r.data.count} price(s) changed by ${pct > 0 ? '+' : ''}${pct}%.`); closeModal(); }
  };
  return (
    <Dialog title="Change all prices by a percentage" onClose={closeModal} actions={<><Btn onClick={apply} disabled={!ok || !count}>Change {count} price{count === 1 ? '' : 's'}</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <Field label="Percentage (+ up, - down)" type="number" step="any" placeholder="e.g. 10 or -5" {...bind('percent')} />
        <Field label="Which parts"><select {...bind('make')}><option value="">All parts</option>{Object.entries(MAKES).map(([k, n]) => <option key={k} value={k}>{n} only ({k})</option>)}</select></Field>
      </div>
      {ok && <p className="mu">Example: a price of 1,000.00 becomes <b>{money(r2(1000 * (1 + pct / 100)))}</b>. {count} part(s) will change.</p>}
      <p className="mu small">Prices are rounded to cents. Prices already on job cards and issued invoices do not change.</p>
    </Dialog>
  );
}

// ---- GRN: parts bought, added to stock with their cost ----
// Search the stock list by part number or description, then enter the quantity bought and the cost. The cost is kept on the part and the price follows (cost x 1.3).
export function GrnDialog({ pid }) {
  const { db, me, run, closeModal } = useApp(), { print } = usePrint(), mgr = isMgr(me);
  const first = pid && db.p.find(x => x.id === pid);
  // a purchase being typed is kept on this device (power cut, closed tab) until it is saved or cleared
  const K = `grn:${me.id}`, HEAD = { supplier: '', ref: '', note: '' };
  const [h, bind, setH] = usePersistedForm(K + ':head', HEAD);
  const [lines, setLines, restored] = usePersistedState(K + ':lines', []);
  const [text, setText] = useState(''), [saved, setSaved] = useState(null);
  // opened from a part's own button: that part is on the list (a restored draft keeps its lines and gets this one added)
  useEffect(() => { if (first) setLines(ls => (ls.some(l => l.pid === first.id) ? ls : [...ls, { pid: first.id, qty: '', cost: first.cost || '', price: '' }])); }, [first?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (db.p?.length) setLines(ls => (ls.every(l => db.p.some(x => x.id === l.pid)) ? ls : ls.filter(l => db.p.some(x => x.id === l.pid)))); }, [db.p, setLines]);   // a restored line for a part that has gone is dropped
  const startOver = () => { setLines([]); setH(HEAD); };
  const part = id => db.p.find(x => x.id === id) || {};
  const set = (i, patch) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const add = p => { setText(''); setLines(ls => (ls.some(l => l.pid === p.id) ? ls : [...ls, { pid: p.id, qty: '', cost: p.cost || '', price: '' }])); };
  const total = r2(lines.reduce((s, l) => s + num(l.qty) * num(l.cost), 0));
  const ready = h.supplier.trim() && lines.length && lines.every(l => num(l.qty) > 0 && l.cost !== '' && num(l.cost) >= 0);
  const save = async () => {
    const r = await run(() => api('/grns', 'POST', { ...h, lines: lines.map(l => ({ pid: l.pid, qty: num(l.qty), cost: num(l.cost), ...(mgr && l.price !== '' && { price: num(l.price) }) })) }));
    if (r.ok) { clearDraft(K + ':lines'); clearDraft(K + ':head'); setSaved(r.data); }   // the server has it: the copy on this device is not needed
  };
  const printIt = g => print(<GrnDoc grn={g} garage={db.cfg.garage} />, 'a4');

  if (saved) return (
    <Dialog title={`${saved.id} saved`} onClose={closeModal} actions={<><Btn onClick={() => printIt(saved)}>Print GRN (A4)</Btn><Btn kind="ol" onClick={closeModal}>Close</Btn></>}>
      <p>The quantities are in stock. {saved.supplier}{saved.ref ? ` · ${saved.ref}` : ''} · total cost <b>ETB {money(saved.total)}</b>.</p>
      <Table head={['Part number', 'Description', { t: 'Qty', r: 1 }, { t: 'Cost', r: 1 }, { t: 'Price before', r: 1 }, { t: 'Price now', r: 1 }]}>
        {saved.lines.map(l => <tr key={l.pid}><td><b>{l.code}</b></td><td>{l.name}</td><td className="r">{l.qty}</td><td className="r">{money(l.cost)}</td><td className="r">{money(l.price_before)}</td><td className="r">{money(l.price_after)}{l.price_after !== l.price_before ? ' ✓' : ''}</td></tr>)}
      </Table>
    </Dialog>
  );

  return (
    <Dialog title="New GRN · purchase into stock" onClose={closeModal} actions={<><Btn kind="gr" onClick={save} disabled={!ready}>Save GRN and add to stock</Btn>{(lines.length > 0 || h.supplier || h.ref || h.note) && <Btn kind="ol" onClick={startOver}>Start over</Btn>}<Btn kind="ol" onClick={closeModal}>Close (draft is kept)</Btn></>}>
      <div className="row mt">
        <Field label="Supplier" grow="2 1 200px" {...bind('supplier')} /><Field label="Supplier invoice / delivery no" {...bind('ref')} /><Field label="Note" grow="2 1 200px" {...bind('note')} />
      </div>
      {restored && lines.length > 0 && <p className="mu small" role="status">Your unfinished GRN was restored from this device. Check it, then save it, or press Start over.</p>}
      <div className="mt"><PartSearch label="Find the part to add (type the part number or description)" stock={db.p} value={text} onChange={setText} onPick={add} /></div>
      <p className="mu small">Only parts already in the stock list can be bought here. {mgr ? 'To buy a part that is not in the list, create the item first (Parts stock → New item or Import).' : 'A part that is not in the list is created by the manager.'}</p>
      <div className="mt"><Table head={['Part', { t: 'In stock', r: 1 }, { t: 'Quantity bought', r: 1 }, { t: 'Cost each (ETB)', r: 1 }, ...(mgr ? [{ t: 'New price', r: 1 }] : []), { t: 'Line total', r: 1 }, '']} empty={!lines.length && 'Search for a part above to add it.'}>
        {lines.map((l, i) => {
          const p = part(l.pid), auto = priceFromCost(l.cost, db.cfg.markup);
          return (
            <tr key={l.pid}>
              <td><b>{p.code}</b> {p.name}</td><td className="r">{p.stock}</td>
              <td className="r"><input aria-label="Quantity bought" type="number" min="0.01" step="any" style={{ width: 90 }} value={l.qty} onChange={e => set(i, { qty: e.target.value })} /></td>
              <td className="r"><input aria-label="Cost each" type="number" min="0" step="any" style={{ width: 110 }} value={l.cost} onChange={e => set(i, { cost: e.target.value })} /></td>
              {mgr && <td className="r"><input aria-label="New price" type="number" min="0" step="any" style={{ width: 110 }} placeholder={l.cost !== '' ? String(auto) : 'auto'} value={l.price} onChange={e => set(i, { price: e.target.value })} /></td>}
              <td className="r">{money(num(l.qty) * num(l.cost))}</td>
              <td><Btn kind="ol" onClick={() => setLines(ls => ls.filter((_, k) => k !== i))}>Remove</Btn></td>
            </tr>
          );
        })}
      </Table></div>
      <div className="box mt r"><b className="cn total">Total cost ETB {money(total)}</b></div>
      <p className="mu small">The cost is kept on the part. Its price follows as cost x {db.cfg.markup} unless the price was set by hand.{mgr ? ' Type a new price on a line to set it yourself.' : ''} Every change is written in the part's history.</p>
    </Dialog>
  );
}

