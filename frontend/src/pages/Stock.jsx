// Parts stock, purchases (GRN) and the stock-level reminder.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, Table } from '../components/ui.jsx';
import { usePersistedForm } from '../lib/autosave.js';
import { isMgr, isSA } from '../lib/constants.js';
import { dt, money, cur } from '../lib/format.js';
import { MAKES, NO_MODEL, downloadInventory, inMake, lowKey, lowParts, makeOf, priceFromCost } from '../lib/stock.js';
import { usePrint } from '../print/PrintHost.jsx';
import GrnDoc from '../print/GrnDoc.jsx';

const NEW = { code: '', name: '', category: '', cost: '', price: '', priceTyped: false, stock: '', reorder: '' };

export function Parts() {
  const { db, me, run, openModal } = useApp();
  const sa = isSA(me), mgr = isMgr(me), [q, setQ] = useState(''), [make, setMake] = useState('');
  const [f, , set, reset] = usePersistedForm('form:new-part', NEW);
  const low = lowParts(db.p);
  const list = db.p.filter(p => inMake(p.code, make) && (p.code + ' ' + p.name + ' ' + (p.category || '')).toLowerCase().includes(q.toLowerCase()));
  // the price fills itself from the cost until the manager types one
  const shownPrice = f.priceTyped ? f.price : f.cost !== '' ? String(priceFromCost(f.cost, db.cfg.markup)) : '';
  const add = async () => {
    if (!f.code.trim() || !f.name.trim()) return alert('Part number and description are required.');
    const r = await run(() => api('/inventory', 'POST', { code: f.code, name: f.name, category: f.category, cost: f.cost, ...(f.priceTyped && f.price !== '' && { price: f.price }), stock: f.stock, reorder: f.reorder }));
    if (r.ok) reset();
  };
  const bind = k => ({ value: f[k], onChange: e => set({ [k]: e.target.value }) });
  return (
    <>
      {low.length > 0 && <div className="box mt"><b>{low.length} part(s) at or below the minimum stock:</b> {low.slice(0, 20).map(p => p.code).join(', ')}{low.length > 20 ? '…' : ''}</div>}
      {mgr && <div className="box mt"><h3>New item</h3>
        <div className="row">
          <Field label="Part number" {...bind('code')} />
          <Field label="Description" grow="3 1 200px" {...bind('name')} />
          <Field label="Category" {...bind('category')} />
          <Field label={`Cost (${cur()})`} type="number" min="0" step="any" {...bind('cost')} />
          <Field label={`Price (${cur()}) · fills as cost x ${db.cfg.markup}`} type="number" min="0" step="any" value={shownPrice} onChange={e => set({ price: e.target.value, priceTyped: true })} />
          <Field label="Opening quantity" type="number" min="0" step="any" {...bind('stock')} />
          <Field label="Minimum stock" type="number" min="0" step="any" {...bind('reorder')} />
          <Btn onClick={add}>Save item</Btn>
        </div>
        <div className="mu small">{f.code && (makeOf(f.code) ? `${makeOf(f.code)} part. ` : 'No model (oil or a general part), kept as typed. ')}The price is filled as cost x {db.cfg.markup}; type another price to override it.</div>
      </div>}
      <div className="row mt">
        <input aria-label="Search parts" placeholder="Search by part number or description" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '3 1 240px' }} />
        <select aria-label="Make" value={make} onChange={e => setMake(e.target.value)} style={{ flex: '0 1 180px' }}><option value="">All makes</option>{Object.entries(MAKES).map(([k, n]) => <option key={k} value={k}>{n} ({k})</option>)}<option value={NO_MODEL}>Other (no model)</option></select>
        {sa && <Btn onClick={() => openModal('grn')}>New GRN (purchase)</Btn>}
        {mgr && <><Btn kind="ol" onClick={() => openModal('importItems')}>Import Excel</Btn><Btn kind="ol" onClick={() => downloadInventory(db.p)}>Export to Excel</Btn><Btn kind="ol" onClick={() => openModal('bulkPrice')}>Change all prices</Btn></>}
      </div>
      <div className="mt"><Table head={['Part number', 'Make', 'Description', ...(mgr ? [{ t: 'Cost', r: 1 }] : []), { t: 'Price', r: 1 }, { t: 'In stock', r: 1 }, { t: 'Minimum', r: 1 }, '']} empty={!list.length && 'No parts match.'}>
        {list.map(p => (
          <tr key={p.id}>
            <td><b>{p.code}</b></td><td>{makeOf(p.code) || <span className="mu">—</span>}</td><td>{p.name}{p.category && <span className="mu small"> · {p.category}</span>}</td>
            {mgr && <td className="r">{money(p.cost)}</td>}
            <td className="r">{money(p.price)}</td>
            <td className="r">{p.stock <= p.reorder ? <Pill tone="a">{p.stock <= 0 ? 'out' : `${p.stock} low`}</Pill> : p.stock}</td><td className="r">{p.reorder}</td>
            <td className="acts"><Btn kind="ol" onClick={() => openModal('history', { id: p.id })}>History</Btn>
              {sa && <><Btn kind="ol" onClick={() => openModal('grn', { pid: p.id })}>Receive (GRN)</Btn><Btn kind="ol" onClick={() => openModal('count', { id: p.id })}>Count</Btn></>}
              {mgr && <Btn kind="ol" onClick={() => openModal('editPart', { id: p.id })}>Edit</Btn>}</td>
          </tr>
        ))}
      </Table></div>
      {!mgr && sa && <p className="mu small mt">Costs and prices are set by the manager.</p>}
    </>
  );
}

// ---- purchases: every GRN ----
export function Purchases() {
  const { db, me, openModal, say } = useApp(), { print } = usePrint();
  const [rows, setRows] = useState(null), [q, setQ] = useState('');
  const load = () => api('/grns').then(setRows).catch(e => say(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [db.p]);   // again whenever stock changes (a GRN was just saved)
  const list = (rows || []).filter(g => (g.id + g.supplier + g.ref + g.lines.map(l => l.code + ' ' + l.name).join(' ')).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row mt"><input aria-label="Search purchases" placeholder="Search by GRN, supplier, invoice number, part number or description" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '3 1 240px' }} />{isSA(me) && <Btn onClick={() => openModal('grn')}>New GRN</Btn>}</div>
      <div className="mt"><Table head={['GRN', 'Date', 'Supplier', 'Invoice no', 'Parts', { t: 'Total cost', r: 1 }, 'By', '']} empty={rows && !list.length && 'No purchases yet.'}>
        {list.map(g => (
          <tr key={g.id}>
            <td><b>{g.id}</b></td><td>{dt(g.created)}</td><td>{g.supplier}</td><td>{g.ref}</td><td>{g.lines.length} line(s): {g.lines.slice(0, 3).map(l => `${l.qty} x ${l.code}`).join(', ')}{g.lines.length > 3 ? '…' : ''}</td>
            <td className="r">{money(g.total)}</td><td>{g.by_name}</td><td className="acts"><Btn kind="ol" onClick={() => print(<GrnDoc grn={g} garage={db.cfg.garage} />, 'a4')}>Print</Btn></td>
          </tr>
        ))}
      </Table></div>
    </>
  );
}

// ---- the minimum stock reminder: pops up when a part is at or below its minimum, once per part per sign-in ----
const ACK = 'mg-low-ack';
const readAck = () => { try { return new Set(JSON.parse(sessionStorage.getItem(ACK) || '[]')); } catch { return new Set(); } };
export function LowStockReminder() {
  const { db, me, ready, openModal } = useApp();
  const [show, setShow] = useState(null);
  const ack = useRef(null);
  if (ack.current === null) ack.current = readAck();
  const low = lowParts(db.p);
  const fresh = ready && me.role !== 'TECH' && low.some(p => !ack.current.has(lowKey(p)));
  useEffect(() => { if (fresh && !show) setShow(low); }, [fresh]);    // eslint-disable-line react-hooks/exhaustive-deps
  if (!show) return null;
  const done = () => { low.forEach(p => ack.current.add(lowKey(p))); try { sessionStorage.setItem(ACK, JSON.stringify([...ack.current])); } catch { /* ignore */ } setShow(null); };
  return (
    <Dialog title="Stock reminder · minimum quantity reached" onClose={done} actions={<>{isSA(me) && <Btn onClick={() => { done(); openModal('grn'); }}>Buy stock (GRN)</Btn>}<Btn kind="ol" onClick={done}>OK, noted</Btn></>}>
      <p className="mu">These parts are out of stock or at or below their minimum quantity:</p>
      <Table head={['Part number', 'Description', { t: 'In stock', r: 1 }, { t: 'Minimum', r: 1 }, '']}>
        {show.filter(p => db.p.some(x => x.id === p.id)).map(p => { const n = db.p.find(x => x.id === p.id); return <tr key={p.id}><td><b>{n.code}</b></td><td>{n.name}</td><td className="r">{n.stock}</td><td className="r">{n.reorder}</td><td>{n.stock <= 0 ? <Pill tone="a">out of stock</Pill> : <Pill tone="a">low</Pill>}</td></tr>; })}
      </Table>
    </Dialog>
  );
}
