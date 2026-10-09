import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, StatusPill, Table, useForm } from '../components/ui.jsx';
import { CLOCK_REASONS, SECTIONS, STATUSES, STATUS_NAME, isSA, isTech, isWS } from '../lib/constants.js';
import { activeClock, dt, jobTotals, labourHours, lastDoc, money, pct, vehicleName } from '../lib/format.js';
import { usePrint } from '../print/PrintHost.jsx';
import InvoiceDoc, { invoiceSize } from '../print/InvoiceDoc.jsx';
import VoucherDoc from '../print/VoucherDoc.jsx';

const post = (id, path, body) => api(`/jobs/${id}${path}`, 'POST', body);

// The job card: status steps, customer and vehicle, labour with clocks, parts from stock, notifications, totals and the actions
// the signed-in role may take. Everything is read from the shared data, so it updates by itself when someone else changes the card.
export default function JobCardDialog({ id }) {
  const { db, me, run, job, cust, veh, closeModal } = useApp();
  const { print } = usePrint();
  const j = job(id);
  if (!j) return <Dialog title="Job card" onClose={closeModal}><p className="mu">This job card no longer exists.</p></Dialog>;

  const c = cust(j.cid), v = veh(j.vid), vat = db.cfg.vat, garage = db.cfg.garage;
  const sa = isSA(me), ws = isWS(me), work = j.status === 'At workshop', si = STATUSES.indexOf(j.status);
  const t = jobTotals(j, vat);
  const printInvoice = (jc, doc) => print(<InvoiceDoc job={jc} customer={c} vehicle={v} doc={doc} garage={garage} vat={vat} />, invoiceSize(doc));
  const printVoucher = jc => print(<VoucherDoc job={jc} customer={c} vehicle={v} garage={garage} />, 'a4');

  const go = to => run(() => post(j.id, '/status', { to }));
  const close = () => {
    if (!confirm(`Check before closing ${j.id}:\n\nLabour items: ${j.labours.length} (all completed)\nParts lines issued: ${j.parts.length}\n\nClose the job card? The customer will be told the vehicle is ready.`)) return;
    go('Closed');
  };
  const invoice = async type => {
    const r = await run(() => post(j.id, '/invoice', { type }));
    if (r.ok) printInvoice(r.data, type === 'Proforma' ? lastDoc(r.data, 'Proforma') : r.data.inv);
  };
  const deliver = async () => {
    const r = await run(() => post(j.id, '/status', { to: 'Delivered' }));
    if (r.ok) printVoucher(r.data);
  };

  let actions = null;
  if (sa) {
    if (j.status === 'Created') actions = <Btn onClick={() => go('Dispatched')}>Dispatch to workshop</Btn>;
    if (j.status === 'Work done') actions = <Btn onClick={() => go('Back with SA')}>Receive job card</Btn>;
    if (j.status === 'Back with SA') actions = <Btn kind="gr" onClick={close}>Close job card</Btn>;
    if (j.status === 'Closed' || j.status === 'Invoiced') actions = <>
      <Btn kind="ol" onClick={() => invoice('Proforma')}>Print proforma</Btn>
      {j.inv ? <Btn kind="ol" onClick={() => printInvoice(j, j.inv)}>Reprint {j.inv.type} invoice (POS)</Btn>
        : <><Btn onClick={() => invoice('Cash')}>Cash invoice (POS)</Btn><Btn onClick={() => invoice('Credit')}>Credit invoice (POS)</Btn></>}
      {j.status === 'Invoiced' && <Btn kind="gr" onClick={deliver}>Print delivery voucher &amp; hand over</Btn>}
    </>;
    if (j.status === 'Delivered') actions = <>
      <Btn kind="ol" onClick={() => printInvoice(j, j.inv)}>Reprint invoice</Btn><Btn kind="ol" onClick={() => printVoucher(j)}>Reprint delivery voucher</Btn>
    </>;
  }
  if (ws && j.status === 'Dispatched') actions = <Btn kind="gr" onClick={() => go('At workshop')}>Receive job card</Btn>;
  if (ws && work) actions = <Btn kind="gr" onClick={() => go('Work done')}>Dispatch back to Service Advisor</Btn>;

  const clocks = j.labours.flatMap(l => (l.logs || []).map(x => ({ ...x, work: l.desc })));
  const showNotes = ['Closed', 'Invoiced', 'Delivered'].includes(j.status) && !isTech(me);

  return (
    <Dialog title={<>{j.id} <StatusPill status={j.status} /></>} onClose={closeModal}>
      <ol className="steps" aria-label="Progress">
        {STATUSES.map((s, i) => <li key={s} className={i < si ? 'd' : i === si ? 'c' : ''} aria-current={i === si ? 'step' : undefined}>{STATUS_NAME[s]}</li>)}
      </ol>

      <div className="g g2">
        <div className="box"><b>{c.name}</b> <span className="mu">{c.id}</span><br />{c.phone}<br /><span className="mu">{[c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ')}</span></div>
        <div className="box"><b>{v.plate}</b> · {vehicleName(v)}<br /><span className="mu">VIN {v.vin} · Engine {v.eng} · {v.col}</span></div>
      </div>
      {j.note && <p className="mu">Notes: {j.note}</p>}

      <h3 className="mt">Labour</h3>
      <Table head={['Work', 'Price', 'Time', '']} empty={!j.labours.length && 'No labour yet. Add the work to be done.'}>
        {j.labours.map(l => <LabourRow key={l.id} job={j} l={l} canClock={work && !l.done && me.role !== 'SA'} canStop={ws} canRemove={sa && j.status === 'Created'} />)}
      </Table>
      {sa && j.status === 'Created' && <LabourForm id={j.id} rate={db.cfg.labourRate} />}

      <h3 className="mt">Parts issued</h3>
      <Table head={['Part', 'Qty', 'Unit', 'Total', '']} empty={!j.parts.length && 'No parts issued.'}>
        {j.parts.map((p, i) => (
          <tr key={i}>
            <td>{p.code && <span className="mu">{p.code} </span>}{p.name}</td><td>{p.qty}</td><td>{money(p.price)}</td><td>{money(p.qty * p.price)}</td>
            <td>{sa && si < 5 && <Btn kind="ol" onClick={() => run(() => api(`/jobs/${j.id}/parts/${i}`, 'DELETE'))}>Remove</Btn>}</td>
          </tr>
        ))}
      </Table>
      {sa && si < 5 && <PartForm id={j.id} stock={db.p} />}

      {clocks.length > 0 && <>
        <h3 className="mt">Clock history</h3>
        <Table head={['Work', 'Technician', 'In', 'Out', 'Reason']}>
          {clocks.map((x, i) => <tr key={i}><td>{x.work}</td><td>{x.tech}</td><td>{dt(x.in)}</td><td>{dt(x.out)}</td><td>{x.reason || ''}</td></tr>)}
        </Table>
      </>}

      {showNotes && <Notifications job={j} canResend={sa && ['Closed', 'Invoiced'].includes(j.status)} />}

      <div className="box mt r">
        Labour {money(t.l)} · Parts {money(t.p)} · VAT {pct(t.rate)}% {money(t.vat)}
        <br /><b className="cn total">Total ETB {money(t.total)}</b>
      </div>
      <div className="row mt">{actions || <span className="mu">No action for your role at this stage.</span>}</div>
    </Dialog>
  );
}

function LabourRow({ job: j, l, canClock, canStop, canRemove }) {
  const { run } = useApp();
  const [reason, setReason] = useState('Completed');
  const a = activeClock(l), base = `/jobs/${j.id}/labour/${l.id}`;
  return (
    <tr>
      <td>{l.desc} <span className="mu">{l.section}</span>{l.done ? <> <Pill tone="g">completed</Pill></> : a ? <> <Pill tone="a">{a.tech} working</Pill></> : null}</td>
      <td>{money(l.price)}</td>
      <td>{labourHours(l).toFixed(2)} h</td>
      <td className="acts">
        {canClock && (a ? <>
          <select aria-label="Clock-out reason" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 'auto' }}>{CLOCK_REASONS.map(r => <option key={r}>{r}</option>)}</select>
          <Btn kind="gr" onClick={() => run(() => api(base + '/clockout', 'POST', { reason }))}>Clock out</Btn>
          {canStop && <Btn kind="ol" onClick={() => run(() => api(base + '/clockout', 'POST', { reason: 'Supervisor command' }))}>Supervisor stop</Btn>}
        </> : <Btn onClick={() => run(() => api(base + '/clockin', 'POST'))}>Clock in</Btn>)}
        {canRemove && <Btn kind="ol" onClick={() => run(() => api(base, 'DELETE'))}>Remove</Btn>}
      </td>
    </tr>
  );
}

function LabourForm({ id, rate }) {
  const { run } = useApp();
  const [f, bind, set, reset] = useForm({ desc: '', section: SECTIONS[0], hours: '', price: '' });
  const add = async () => {
    if (!f.desc.trim()) return;
    const r = await run(() => post(id, '/labour', { desc: f.desc, section: f.section, price: parseFloat(f.price) || 0, hours: parseFloat(f.hours) || 0 }));
    if (r.ok) reset();
  };
  return (
    <div className="row mt">
      <Field label="Labour description" grow="3 1 200px" {...bind('desc')} />
      <Field label="Section"><select {...bind('section')}>{SECTIONS.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Hours" type="number" min="0" step="0.25" value={f.hours}
        onChange={e => set({ hours: e.target.value, price: Math.round((parseFloat(e.target.value) || 0) * rate * 100) / 100 || '' })} />
      <Field label={`Price (ETB) · ${rate}/h`} type="number" min="0" {...bind('price')} />
      <Btn onClick={add}>Add labour</Btn>
    </div>
  );
}

// Typing a code or name picks from the stock list (price comes from the list and the quantity leaves stock); anything else is free text, not tracked.
function PartForm({ id, stock }) {
  const { run } = useApp();
  const [f, bind, , reset] = useForm({ name: '', qty: 1, price: '' });
  const key = s => (s || '').trim().toLowerCase();
  const p = stock.find(x => key(`${x.code} · ${x.name}`) === key(f.name) || key(x.code) === key(f.name));
  const add = async () => {
    if (!f.name.trim()) return;
    const qty = parseFloat(f.qty) || 1;
    const r = await run(() => post(id, '/parts', p ? { pid: p.id, qty } : { name: f.name.trim(), qty, price: parseFloat(f.price) || 0 }));
    if (r.ok) reset();
  };
  return (
    <>
      <div className="row mt">
        <Field label="Part (type a code or name to search the stock list)" grow="3 1 200px" list="part-list" autoComplete="off" {...bind('name')} />
        <Field label="Qty" type="number" min="0.01" step="any" {...bind('qty')} />
        <Field label="Unit price" type="number" min="0" disabled={!!p} value={p ? p.price : f.price} onChange={bind('price').onChange} />
        <Btn onClick={add}>Issue part</Btn>
      </div>
      <datalist id="part-list">{stock.map(x => <option key={x.id} value={`${x.code} · ${x.name}`}>{x.stock} in stock</option>)}</datalist>
      <div className="mu small">{p ? `${p.stock} in stock · unit price ${money(p.price)} (from the stock list)` : f.name ? 'Not in the stock list: stock will not be tracked for this line.' : ''}</div>
    </>
  );
}

// What was sent to the customer when the vehicle became ready. The message goes out a moment after closing, so look again a few times.
function Notifications({ job: j, canResend }) {
  const { run } = useApp();
  const [rows, setRows] = useState(null), [err, setErr] = useState('');
  const load = () => api(`/jobs/${j.id}/notifications`).then(r => { setRows(r); setErr(''); return r; }).catch(e => setErr(e.message));
  useEffect(() => {
    let n = 0, t; const tick = async () => { const r = await load(); if (r && !r.length && j.status === 'Closed' && ++n < 4) t = setTimeout(tick, 3000); };
    tick(); return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.id, j.status]);
  const resend = async () => { const r = await run(() => post(j.id, '/notify')); if (r.ok) setRows(r.data); };
  return (
    <>
      <h3 className="mt">Customer notification</h3>
      {err ? <p className="mu">{err}</p> : rows === null ? <p className="mu">Loading…</p> : rows.length ? (
        <Table head={['When', 'Channel', 'To', 'Result']}>
          {rows.map(x => <tr key={x.id}><td>{dt(x.at)}</td><td>{x.channel}</td><td>{x.to_addr}</td><td><Pill tone={x.status === 'sent' ? 'g' : x.status === 'failed' ? 'a' : ''}>{x.status}</Pill> <span className="mu">{x.error || ''}</span></td></tr>)}
        </Table>
      ) : <p className="mu">No message sent yet.</p>}
      {canResend && <div className="mt"><Btn kind="ol" onClick={resend}>Send "vehicle ready" message again</Btn></div>}
    </>
  );
}
