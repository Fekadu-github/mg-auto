// Point of sale (cash sale, credit sale, proforma, cancel for the manager) and Invoices & payments.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, Stat, Table, useForm } from '../components/ui.jsx';
import PartSearch from '../components/PartSearch.jsx';
import { isAdmin, isMgr, isSA } from '../lib/constants.js';
import { dt, money, pct, r2, today, cur } from '../lib/format.js';
import { usePrint } from '../print/PrintHost.jsx';
import { usePersistedState } from '../lib/autosave.js';
import SaleDoc, { saleSize } from '../print/SaleDoc.jsx';

const num = v => parseFloat(v) || 0;
const KINDS = [['Cash', 'Cash sale'], ['Credit', 'Credit sale'], ['Proforma', 'Proforma']];
const EMPTY = { kind: 'Cash', cid: '', name: '', phone: '', tin: '', note: '', show_codes: true };
const salePill = s => (s.status === 'Cancelled' ? <Pill tone="a">cancelled</Pill> : s.status === 'Converted' ? <Pill>→ {s.converted_to}</Pill> : s.kind === 'Credit' ? (s.paid >= s.totals.total - 0.005 ? <Pill tone="g">paid</Pill> : <Pill tone="a">{s.paid > 0 ? 'part paid' : 'unpaid'}</Pill>) : s.kind === 'Cash' ? <Pill tone="g">paid</Pill> : <Pill>quote</Pill>);

export function PointOfSale() {
  const { db, me, run, say, refresh } = useApp(), { print } = usePrint(), mgr = isMgr(me);
  // the sale being typed is kept on this device (power cut, closed tab) until it is completed or cleared
  const [f, setF, restoredF] = usePersistedState(`pos:${me.id}:sale`, EMPTY), [lines, setLines, restoredL] = usePersistedState(`pos:${me.id}:lines`, []);
  const [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const restored = restoredF || restoredL;
  const [sales, setSales] = useState(null), [q, setQ] = useState('');
  const patch = p => setF(s => ({ ...s, ...p }));
  const loadSales = () => api('/sales').then(setSales).catch(e => say(e.message));
  useEffect(() => { loadSales(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [db.p]);   // stock changes whenever a sale is made or cancelled

  useEffect(() => { if (db.p?.length) setLines(ls => (ls.every(l => db.p.some(x => x.id === l.pid)) ? ls : ls.filter(l => db.p.some(x => x.id === l.pid)))); }, [db.p, setLines]);   // a restored line for a part that has gone from the list is dropped
  const part = id => db.p.find(x => x.id === id) || {};
  const sub = r2(lines.reduce((s, l) => s + num(l.qty) * part(l.pid).price, 0)), vat = r2(sub * db.cfg.vat), total = r2(sub + vat);
  const add = p => { setText(''); setLines(ls => (ls.some(l => l.pid === p.id) ? ls.map(l => (l.pid === p.id ? { ...l, qty: num(l.qty) + 1 } : l)) : [...ls, { pid: p.id, qty: 1 }])); };
  const lost = async name => { const r = await run(() => api('/lost-sales', 'POST', { name, qty: 1, source: 'POS', reason: 'Not in the stock list' })); if (r.ok) { say(`Lost sale recorded: ${name}`); setText(''); } };
  const pickCustomer = id => { const c = db.c.find(x => x.id === id); patch(c ? { cid: id, name: c.name, phone: c.phone, tin: c.tin || '' } : { cid: '', name: '', phone: '', tin: '' }); };
  const short = lines.filter(l => num(l.qty) > part(l.pid).stock);

  const complete = async () => {
    if (!lines.length) return;
    if (f.kind === 'Credit' && !f.name.trim()) return say('A credit sale needs the customer name.');
    setBusy(true);
    const r = await run(() => api('/sales', 'POST', { ...f, lines: lines.map(l => ({ pid: l.pid, qty: num(l.qty) })) }));
    setBusy(false);
    if (r.ok) { setLines([]); setF({ ...EMPTY, kind: f.kind }); loadSales(); print(<SaleDoc sale={r.data} garage={db.cfg.garage} />, saleSize(r.data)); }
    else loadSales();    // a refused sale (not enough stock) was written down as a lost sale
  };
  // Manager: edit the quantities and prices of a sale or proforma. Administrator: delete it.
  const [ed, setEd] = useState(null), setL = (i, p) => setEd(e => ({ ...e, lines: e.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) }));
  const openEdit = s => setEd({ id: s.id, kind: s.kind, name: s.cust_name || '', phone: s.cust_phone || '', tin: s.cust_tin || '', note: s.note || '', lines: s.lines.map(l => ({ pid: l.pid, code: l.code, name: l.name, qty: String(l.qty), price: String(l.price) })) });
  const saveEdit = async () => {
    if (!ed.lines.length) return say('A sale needs at least one part. To remove the whole sale, ask the Administrator to delete it.');
    const r = await run(() => api(`/sales/${ed.id}`, 'PUT', { name: ed.name, phone: ed.phone, tin: ed.tin, note: ed.note, lines: ed.lines.map(l => ({ pid: l.pid, qty: num(l.qty), price: num(l.price) })) }));
    if (r.ok) { say(`${ed.id} updated.`); setEd(null); loadSales(); }
  };
  const del = async s => {
    if (!confirm(`Delete ${s.id} (${cur()} ${money(s.totals.total)}) for good?\n\n${s.kind !== 'Proforma' && s.status === 'Issued' ? 'The parts go back into stock. ' : ''}Its payments are deleted too. This cannot be undone.`)) return;
    const r = await run(() => api(`/sales/${s.id}`, 'DELETE'));
    if (r.ok) { say(`${s.id} deleted.`); loadSales(); }
  };
  const reprint = s => print(<SaleDoc sale={s} garage={db.cfg.garage} />, saleSize(s));
  const cancel = async s => {
    const reason = prompt(`Cancel ${s.id} (${cur()} ${money(s.totals.total)})?\n\nThe parts go back into stock and the sale leaves the reports.\nWhy is it cancelled?`);
    if (!reason?.trim()) return;
    const r = await run(() => api(`/sales/${s.id}/cancel`, 'POST', { reason }));
    if (r.ok) { say(`${s.id} cancelled and the parts are back in stock.`); loadSales(); }
  };
  const convert = async (s, kind) => {
    if (!confirm(`Make ${s.id} a ${kind.toLowerCase()} sale?\n\nThe parts leave stock now, at today's prices.`)) return;
    const r = await run(() => api(`/sales/${s.id}/convert`, 'POST', { kind }));
    if (r.ok) { loadSales(); print(<SaleDoc sale={r.data} garage={db.cfg.garage} />, saleSize(r.data)); }
  };
  const list = (sales || []).filter(s => (s.id + s.cust_name + s.cust_tin + s.kind).toLowerCase().includes(q.toLowerCase()));
  const label = { Cash: 'Complete cash sale', Credit: 'Complete credit sale', Proforma: 'Issue proforma' }[f.kind];

  return (
    <>
      <div className="box mt">
        <div className="row">{KINDS.map(([k, n]) => <label key={k} style={{ flex: '0 0 auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 15, color: 'var(--tx)' }}><input type="radio" name="kind" style={{ width: 'auto' }} checked={f.kind === k} onChange={() => patch({ kind: k })} />{n}</label>)}</div>
        <div className="row mt">
          <Field label="Customer (optional)"><select value={f.cid} onChange={e => pickCustomer(e.target.value)}><option value="">Walk-in / type the details</option>{db.c.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></Field>
          <Field label={f.kind === 'Credit' ? 'Customer name (required)' : 'Customer name'} value={f.name} onChange={e => patch({ name: e.target.value })} />
          <Field label="Phone" type="tel" value={f.phone} onChange={e => patch({ phone: e.target.value })} />
          <Field label="Customer TIN" value={f.tin} onChange={e => patch({ tin: e.target.value })} />
        </div>
        <div className="mt"><PartSearch label="Sell a part (type the part number or description)" stock={db.p} value={text} onChange={setText} onPick={add} onMissing={lost} /></div>
        {restored && lines.length > 0 && <p className="mu small" role="status">Your unfinished sale was restored from this device. Check it, then complete it, or press Start over.</p>}
        <div className="mt"><Table head={['Part number', 'Description', { t: 'In stock', r: 1 }, { t: 'Qty', r: 1 }, { t: 'Price', r: 1 }, { t: 'Amount', r: 1 }, '']} empty={!lines.length && 'Search for a part above to add it to the sale.'}>
          {lines.map((l, i) => {
            const p = part(l.pid), over = num(l.qty) > p.stock;
            return (
              <tr key={l.pid}>
                <td><b>{p.code}</b></td><td>{p.name}</td><td className="r">{over ? <Pill tone="a">{p.stock}</Pill> : p.stock}</td>
                <td className="r"><input aria-label="Quantity" type="number" min="0.01" step="any" style={{ width: 90 }} value={l.qty} onChange={e => setLines(ls => ls.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} /></td>
                <td className="r">{money(p.price)}</td><td className="r">{money(num(l.qty) * p.price)}</td>
                <td><Btn kind="ol" onClick={() => setLines(ls => ls.filter((_, k) => k !== i))}>Remove</Btn></td>
              </tr>
            );
          })}
        </Table></div>
        {short.length > 0 && f.kind !== 'Proforma' && <p role="alert" style={{ color: 'var(--rd)' }}>Not enough stock of {short.map(l => part(l.pid).code).join(', ')}. Lower the quantity, or press the button and the attempt is recorded as a lost sale.</p>}
        <div className="row mt">
          <Field label="Note" grow="3 1 200px" value={f.note} onChange={e => patch({ note: e.target.value })} />
          {f.kind === 'Proforma' && <label style={{ flex: '0 0 auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, color: 'var(--tx)' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.show_codes} onChange={e => patch({ show_codes: e.target.checked })} />Show part numbers on the proforma</label>}
        </div>
        <div className="row mt">
          <div className="r" style={{ flex: 1 }}>Subtotal {money(sub)} · VAT {pct(db.cfg.vat)}% {money(vat)}<br /><b className="cn total">Total {cur()} {money(total)}</b></div>
          <Btn kind={f.kind === 'Proforma' ? 'ol' : 'gr'} onClick={complete} disabled={busy || !lines.length}>{label}</Btn>
          {(lines.length > 0 || f.name || f.phone || f.tin || f.note) && <Btn kind="ol" onClick={() => { if (confirm('Clear this sale and start over?')) { setLines([]); setF(EMPTY); } }}>Start over</Btn>}
        </div>
        <p className="mu small">Prices come from the stock list. {f.kind === 'Proforma' ? 'A proforma is a quote: stock does not change and it is not counted in sales.' : f.kind === 'Cash' ? 'The parts leave stock, and the sale goes to Invoices & payments as paid.' : 'The parts leave stock, and the sale goes to Invoices & payments as unpaid until payments are recorded.'} If a part is not available the sale is refused and recorded as a lost sale.</p>
      </div>

      <h2 className="mt">Recent sales and proformas</h2>
      <div className="row mt"><input aria-label="Search sales" placeholder="Search by number, customer or TIN" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="mt"><Table head={['Number', 'Date', 'Type', 'Customer', 'TIN', { t: 'Total', r: 1 }, 'Status', '']} empty={sales && !list.length && 'No sales yet.'}>
        {list.map(s => (
          <tr key={s.id}>
            <td><b>{s.id}</b></td><td>{dt(s.created)}</td><td>{s.kind}</td><td>{s.cust_name}</td><td>{s.cust_tin}</td><td className="r">{money(s.totals.total)}</td>
            <td>{salePill(s)}{s.cancel_reason && <div className="mu small">{s.cancel_reason}</div>}</td>
            <td className="acts">
              <Btn kind="ol" onClick={() => reprint(s)}>Print</Btn>
              {s.kind === 'Proforma' && s.status === 'Issued' && <><Btn kind="ol" onClick={() => convert(s, 'Cash')}>Make cash sale</Btn><Btn kind="ol" onClick={() => convert(s, 'Credit')}>Make credit sale</Btn></>}
              {mgr && s.status === 'Issued' && <Btn kind="ol" onClick={() => openEdit(s)}>Edit</Btn>}
              {mgr && s.kind !== 'Proforma' && s.status === 'Issued' && <Btn kind="ol" onClick={() => cancel(s)}>Cancel sale</Btn>}
              {isAdmin(me) && <Btn kind="ol" onClick={() => del(s)}>Delete</Btn>}
            </td>
          </tr>
        ))}
      </Table></div>
      {ed && <Dialog title={`Edit ${ed.id}`} onClose={() => setEd(null)} actions={<><Btn onClick={saveEdit}>Save changes</Btn><Btn kind="ol" onClick={() => setEd(null)}>Cancel</Btn></>}>
        <div className="row">
          <Field label="Customer" value={ed.name} onChange={e => setEd(x => ({ ...x, name: e.target.value }))} />
          <Field label="Phone" value={ed.phone} onChange={e => setEd(x => ({ ...x, phone: e.target.value }))} />
          <Field label="TIN" value={ed.tin} onChange={e => setEd(x => ({ ...x, tin: e.target.value }))} />
        </div>
        <div className="mt"><Table head={['Part number', 'Description', { t: 'Qty', r: 1 }, { t: `Price (${cur()})`, r: 1 }, { t: 'Line total', r: 1 }, '']}>
          {ed.lines.map((l, i) => <tr key={l.pid}>
            <td><b>{l.code}</b></td><td>{l.name}</td>
            <td className="r"><input aria-label="Quantity" type="number" min="0.01" step="any" style={{ width: 90 }} value={l.qty} onChange={e => setL(i, { qty: e.target.value })} /></td>
            <td className="r"><input aria-label="Price" type="number" min="0" step="any" style={{ width: 110 }} value={l.price} onChange={e => setL(i, { price: e.target.value })} /></td>
            <td className="r">{money(r2(num(l.qty) * num(l.price)))}</td>
            <td className="acts"><Btn kind="ol" onClick={() => setEd(x => ({ ...x, lines: x.lines.filter((_, k) => k !== i) }))}>Remove</Btn></td>
          </tr>)}
        </Table></div>
        <Field label="Note" value={ed.note} onChange={e => setEd(x => ({ ...x, note: e.target.value }))} />
        <p className="mu small">{ed.kind === 'Proforma' ? 'A proforma is a quote: stock does not change.' : 'Stock follows the change in quantity.'} VAT is added on the total. The change is written to the audit trail.</p>
      </Dialog>}
    </>
  );
}

// ---- Invoices & payments: every cash and credit invoice (job cards and point of sale), what was paid and what is still owed ----
const METHODS = ['Cash', 'Bank transfer', 'Telebirr', 'Cheque', 'Other'];
export function PaymentDialog({ inv, onClose, onDone }) {
  const { run, say } = useApp();
  const [f, bind] = useForm({ amount: String(inv.balance), method: 'Cash', note: '' });
  const save = async () => {
    const r = await run(() => api('/payments', 'POST', { source: inv.source, ref: inv.ref, amount: num(f.amount), method: f.method, note: f.note }));
    if (r.ok) { say(r.data.balance > 0 ? `Payment recorded. ${cur()} ${money(r.data.balance)} still to pay.` : `${inv.no} is fully paid.`); onDone(); }
  };
  return (
    <Dialog title={`Payment · ${inv.no}`} onClose={onClose} actions={<><Btn kind="gr" onClick={save} disabled={!(num(f.amount) > 0) || inv.balance <= 0}>Record payment</Btn><Btn kind="ol" onClick={onClose}>Close</Btn></>}>
      <p>{inv.customer || 'Customer'} · invoice total <b>{money(inv.total)}</b> · paid {money(inv.paid)} · <b>balance {money(inv.balance)}</b></p>
      <div className="row mt">
        <Field label={`Amount received (${cur()})`} type="number" min="0.01" step="any" {...bind('amount')} />
        <Field label="Method"><select {...bind('method')}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Note (reference, cheque no…)" grow="2 1 200px" {...bind('note')} />
      </div>
      {inv.payments.length > 0 && <div className="mt"><h3>Earlier payments</h3><Table head={['When', { t: 'Amount', r: 1 }, 'Method', 'Note', 'By']}>
        {inv.payments.map(p => <tr key={p.id}><td>{dt(p.at)}</td><td className="r">{money(p.amount)}</td><td>{p.method}</td><td>{p.note}</td><td>{p.by_name}</td></tr>)}
      </Table></div>}
    </Dialog>
  );
}

const tone = s => (s === 'Paid' ? 'g' : s === 'Cancelled' ? '' : 'a');
export function Invoices() {
  const { me, openModal, say, db } = useApp();
  const [rows, setRows] = useState(null), [q, setQ] = useState(''), [status, setStatus] = useState(''), [pay, setPay] = useState(null), [range, setRange] = useState({ from: '', to: '' });
  const load = () => api('/invoices' + (range.from && range.to ? `?from=${range.from}&to=${range.to}` : '')).then(setRows).catch(e => say(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [db.j, range.from, range.to]);   // again when a job card is invoiced
  const live = (rows || []).filter(r => r.status !== 'Cancelled');
  const list = (rows || []).filter(r => (!status || r.status === status) && (r.no + r.customer + r.tin + r.ref).toLowerCase().includes(q.toLowerCase()));
  const sum = { total: r2(live.reduce((s, r) => s + r.total, 0)), paid: r2(live.reduce((s, r) => s + r.paid, 0)), owed: r2(live.reduce((s, r) => s + r.balance, 0)) };
  return (
    <>
      <div className="g g2 mt">{[['Invoiced (incl. VAT)', money(sum.total)], ['Collected', money(sum.paid)], ['Still to collect', money(sum.owed)], ['Unpaid or part paid', live.filter(r => r.balance > 0).length]].map(([a, b]) => <Stat key={a} label={a} value={b} small />)}</div>
      <div className="row mt">
        <input aria-label="Search invoices" placeholder="Search by invoice, customer, TIN or job card" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '3 1 240px' }} />
        <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} style={{ flex: '0 1 160px' }}><option value="">All statuses</option>{['Unpaid', 'Part paid', 'Paid', 'Cancelled'].map(s => <option key={s}>{s}</option>)}</select>
        <Field label="From" type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /><Field label="To" type="date" max={today()} value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
        {(range.from || range.to) && <Btn kind="ol" onClick={() => setRange({ from: '', to: '' })}>All dates</Btn>}
      </div>
      <p className="mu small">Cash invoices are paid when they are issued. Credit invoices are paid here, in one or more payments. Invoices come from job cards and from the point of sale.{(range.from || range.to) && !(range.from && range.to) && ' Choose both dates to filter.'}</p>
      <div className="mt"><Table head={['Invoice', 'Date', 'From', 'Customer', 'TIN', 'Type', { t: 'Total', r: 1 }, { t: 'Paid', r: 1 }, { t: 'Balance', r: 1 }, 'Status', '']} empty={rows && !list.length && 'No invoices.'}>
        {list.map(r => (
          <tr key={r.key}>
            <td><b>{r.no}</b></td><td>{dt(r.date)}</td><td>{r.source === 'job' ? <button type="button" className="lnk" onClick={() => openModal('job', { id: r.ref })}>{r.ref}</button> : 'Point of sale'}</td>
            <td>{r.customer}</td><td>{r.tin}</td><td>{r.type}</td><td className="r">{money(r.total)}</td><td className="r">{money(r.paid)}</td><td className="r">{r.balance > 0 ? <b>{money(r.balance)}</b> : money(0)}</td>
            <td><Pill tone={tone(r.status)}>{r.status}</Pill></td>
            <td className="acts">{isSA(me) && r.type === 'Credit' && r.status !== 'Cancelled' && r.balance > 0 && <Btn onClick={() => setPay(r)}>Record payment</Btn>}{r.payments.length > 0 && r.balance <= 0 && <Btn kind="ol" onClick={() => setPay(r)}>Payments</Btn>}</td>
          </tr>
        ))}
      </Table></div>
      {pay && <PaymentDialog key={pay.key} inv={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); load(); }} />}
    </>
  );
}
