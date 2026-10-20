import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, StatusPill, Table } from '../components/ui.jsx';
import { isListed, taskDesc } from '../components/Lines.jsx';
import { groupLines, groupTasks, serviceGroups } from '../lib/labourGroups.js';
import TaskSearch from '../components/TaskSearch.jsx';
import PartSearch from '../components/PartSearch.jsx';
import { usePersistedForm as useForm } from '../lib/autosave.js';
import { CLOCK_REASONS, SECTIONS, SECTION_CODE, STATUSES, STATUS_NAME, isAdmin, isMgr, isSA, isTech, isWS, sectionOption } from '../lib/constants.js';
import { activeClock, dt, jobTotals, km, labourHours, lastDoc, matchPart, money, pct, rateOf, vehicleName } from '../lib/format.js';
import { suggestService } from '../lib/services.js';
import { usePrint } from '../print/PrintHost.jsx';
import InvoiceDoc, { invoiceSize } from '../print/InvoiceDoc.jsx';
import VoucherDoc from '../print/VoucherDoc.jsx';

const post = (id, path, body) => api(`/jobs/${id}${path}`, 'POST', body);
const put = (id, path, body) => api(`/jobs/${id}${path}`, 'PUT', body);
const r2 = n => Math.round(n * 100) / 100;

// The job card: status steps, customer and vehicle, mileage and service, labour with clocks, parts, part requests, notifications, totals and the actions
// the signed-in role may take. Everything is read from the shared data, so it updates by itself when someone else changes the card.
export default function JobCardDialog({ id }) {
  const { db, me, run, job, cust, veh, closeModal } = useApp();
  const { print } = usePrint();
  const j = job(id);
  if (!j) return <Dialog title="Job card" onClose={closeModal}><p className="mu">This job card no longer exists.</p></Dialog>;

  const c = cust(j.cid), v = veh(j.vid), vat = db.cfg.vat, garage = db.cfg.garage;
  const sa = isSA(me), ws = isWS(me), work = j.status === 'At workshop', si = STATUSES.indexOf(j.status);
  const t = jobTotals(j, vat);
  const priceOpen = sa && !j.inv;                         // the selling price can be changed until the invoice is issued
  const labourOpen = sa && !j.inv && ['Created', 'Dispatched', 'Back with SA', 'Closed'].includes(j.status);   // not while the vehicle is in the workshop
  const partsOpen = sa && !j.inv && si <= STATUSES.indexOf('Closed');
  const done = si >= STATUSES.indexOf('Closed');
  const stockList = db.p, types = db.st || [];
  const printInvoice = (jc, doc) => print(<InvoiceDoc job={jc} customer={c} vehicle={v} doc={doc} garage={garage} vat={vat} />, invoiceSize(doc));
  const printVoucher = jc => print(<VoucherDoc job={jc} customer={c} vehicle={v} garage={garage} />, 'a4');

  const go = (to, extra) => run(() => post(j.id, '/status', { to, ...extra }));
  const close = () => {
    if (!confirm(`Check before closing ${j.id}:\n\nLabour items: ${j.labours.length} (all completed)\nParts lines issued: ${j.parts.length}\n\nClose the job card? The customer will be told the vehicle is ready.`)) return;
    // the next service is counted from the reading when the vehicle leaves; leave the box as it is if the reading did not change
    const out = prompt(`Mileage (km) when the vehicle leaves the workshop.\nArrival reading: ${j.mileage != null ? j.mileage : 'not recorded'}. The next service is counted from this reading.`, j.mileage != null ? String(j.mileage) : '');
    if (out === null) return;
    go('Closed', out.trim() === '' || Number(out) === j.mileage ? {} : { mileage_out: Number(out) });
  };
  const returnBack = () => {
    if (!confirm(`Send ${j.id} back to the workshop?\n\nAdd the extra tasks and parts first (the labour list fills the price by itself). The workshop receives it again, clocks the new tasks and sends it back.`)) return;
    run(() => post(j.id, '/return'));
  };
  const invoice = async type => {
    const r = await run(() => post(j.id, '/invoice', { type }));
    if (r.ok) printInvoice(r.data, type === 'Proforma' ? lastDoc(r.data, 'Proforma') : r.data.inv);
  };
  const deliver = async () => {
    const r = await run(() => post(j.id, '/status', { to: 'Delivered' }));
    if (r.ok) printVoucher(r.data);
  };

  const removeJob = async () => {
    if (!confirm(`Delete job card ${j.id}${j.inv ? ' (an invoice was issued)' : ''}?\nParts issued on it go back to stock. This cannot be undone.`)) return;
    const r = await run(() => api('/jobs/' + j.id, 'DELETE'));
    if (r.ok) closeModal();
  };
  let actions = null;
  if (sa) {
    if (j.status === 'Created') actions = <Btn onClick={() => go('Dispatched')}>Dispatch to workshop</Btn>;
    if (j.status === 'Work done') actions = <Btn onClick={() => go('Back with SA')}>Receive job card</Btn>;
    if (j.status === 'Back with SA') actions = <><Btn kind="gr" onClick={close}>Close job card</Btn><Btn kind="ol" onClick={returnBack}>Return to workshop (more tasks / parts)</Btn></>;
    if (j.status === 'Closed' || j.status === 'Invoiced') actions = <>
      {j.status === 'Closed' && <Btn kind="ol" onClick={returnBack}>Return to workshop (more tasks / parts)</Btn>}
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
  const requests = j.requests || [], services = j.services || [];
  const serviceVisit = services.length > 0 || j.labours.some(l => l.section === 'Regular Service');   // a service typed in as ordinary labour counts too
  const nextDue = done && serviceVisit && v.next_km ? types.find(x => x.code === v.next_type) : null;
  const pendingPrices = (j.price_reqs || []).filter(r => r.status === 'Requested'), waiting = j.parts.filter(p => p.waiting);
  const mgr = isMgr(me), askPrice = async (path, req) => { const r = await run(() => put(j.id, path, req)); return r.ok ? r.data : false; };
  const knownLabour = [...(db.lt || []).map(t => ({ code: t.code, model_grp: t.model_grp, task: t.task, name: t.name, section: t.section, hours: t.hours, price: t.price })),
    ...types.flatMap(x => x.labours).map(l => ({ name: l.desc, section: 'Regular Service', hours: l.hours, price: l.price }))];

  return (
    <Dialog title={<>{j.id} <StatusPill status={j.status} /></>} onClose={closeModal}>
      <ol className="steps" aria-label="Progress">
        {STATUSES.map((s, i) => <li key={s} className={i < si ? 'd' : i === si ? 'c' : ''} aria-current={i === si ? 'step' : undefined}>{STATUS_NAME[s]}</li>)}
      </ol>

      <div className="g g2">
        <div className="box"><b>{c.name}</b> <span className="mu">{c.id}</span><br />{c.phone}<br /><span className="mu">{[c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ')}</span></div>
        <div className="box"><b>{v.plate}</b> · {vehicleName(v)}<br /><span className="mu">VIN {v.vin} · Engine {v.eng} · {v.col}</span>
          <br />Mileage <b>{j.mileage != null ? km(j.mileage) : 'not recorded'}</b>{sa && j.status === 'Created' && <MileageEdit job={j} />}{j.mileage_out != null && <> · left at <b>{km(j.mileage_out)}</b></>}
        </div>
      </div>
      {j.note && <p className="mu">Notes: {j.note}</p>}
      {sa && !j.inv ? <DetailsBox job={j} /> : (j.claim_no || j.due_date || j.priority) && <p className="mu">{[j.claim_no && <>Claim no <b>{j.claim_no}</b></>, j.due_date && <>Expected finish <b>{j.due_date}</b></>, j.priority && <b>{j.priority}</b>].filter(Boolean).map((x, i) => <span key={i}>{i ? ' · ' : ''}{x}</span>)}</p>}
      {sa && !j.inv ? <PayerBox job={j} /> : j.payer && <p className="mu">Invoice made out to: <b>{j.payer}</b>{j.policy_no ? ` (policy ${j.policy_no})` : ''}</p>}
      {services.length > 0 && <p className="mu">Service on this card: {services.map(x => types.find(t2 => t2.code === x)?.name || `Type ${x}`).join(', ')}</p>}
      {nextDue && <div className="box mt"><b>Next service: {nextDue.name}</b> at {km(v.next_km)} <span className="mu">(suggested from this visit, counted from {km(j.mileage_out ?? j.mileage)})</span></div>}

      {sa && ['Created', 'Dispatched'].includes(j.status) && !j.inv && types.length > 0 && <ServicePanel job={j} vehicle={v} types={types} />}

      <h3 className="mt">Labour</h3>
      {labourOpen && <EstimateLoader job={j} estimates={db.e || []} />}
      <Table head={['Work', 'Price', 'Time', '']} empty={!j.labours.length && 'No labour yet. Add the work to be done.'}>
        {j.labours.map(l => <LabourRow key={l.id} job={j} l={l} canClock={work && !l.done && me.role !== 'SA'} canStop={ws} canRemove={labourOpen && !(l.logs || []).length} priceOpen={priceOpen} mgr={mgr} />)}
      </Table>
      {labourOpen && <LabourForm id={j.id} rate={db.cfg.labourRates || db.cfg.labourRate} known={knownLabour} services={types} late={['Back with SA', 'Closed'].includes(j.status)} />}

      <h3 className="mt">Parts issued</h3>
      <Table head={['Part', 'Qty', 'Unit', 'Total', '']} empty={!j.parts.length && 'No parts issued.'}>
        {j.parts.map((p, i) => (
          <tr key={i}>
            <td>{p.code && <span className="mu">{p.code} </span>}{p.name}{p.waiting && <> <Pill tone="a">waiting for stock</Pill></>}</td><td>{p.qty}</td>
            <td><PriceCell value={p.price} canEdit={priceOpen} onSave={price => askPrice(`/parts/${i}/price`, { price })}
              note={p.list !== undefined && p.list !== p.price ? <span className="mu small"> (list {money(p.list)})</span> : null}
              pending={pendingPrices.find(r => r.kind === 'part' && r.key === `${i}:${p.name}`)} mgr={mgr} onDecide={(rid, ok) => run(() => post(j.id, `/price-requests/${rid}/${ok ? 'approve' : 'reject'}`))} /></td>
            <td>{money(p.qty * p.price)}</td>
            <td>{partsOpen && p.waiting && <Btn kind="gr" onClick={() => run(() => post(j.id, `/parts/${i}/receive`))}>Receive</Btn>}{partsOpen && <Btn kind="ol" onClick={() => run(() => api(`/jobs/${j.id}/parts/${i}`, 'DELETE'))}>Remove</Btn>}</td>
          </tr>
        ))}
      </Table>
      {waiting.length > 0 && <p className="mu small">{waiting.length} part(s) waiting for stock: nothing has left stock yet. Press <b>Receive</b> when the part has arrived (add it with Receive stock first). The card cannot be closed before.</p>}
      {partsOpen && <PartForm id={j.id} stock={stockList} />}

      {(requests.length > 0 || (work && (isTech(me) || ws))) && <PartRequests job={j} stock={stockList} canAsk={work && (isTech(me) || ws)} canIssue={partsOpen} />}

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
      {priceOpen && <p className="mu small">Labour, parts and selling prices can be edited here until the invoice is issued{done ? ' (the card is closed, so added tasks are billing lines; use "Return to workshop" for work that must be done)' : ''}. Every price change is written in the job card history.</p>}
      <div className="row mt">{actions || <span className="mu">No action for your role at this stage.</span>}{isAdmin(me) && <Btn kind="ol" onClick={removeJob}>Delete job card</Btn>}</div>
    </Dialog>
  );
}

// A price with an Edit button (Service Advisor, before the invoice). onSave(price) returns true when the server accepted it.
function PriceCell({ value, canEdit, onSave, note, pending, mgr, onDecide }) {
  const { db, say } = useApp();
  const [edit, setEdit] = useState(false), [v, setV] = useState('');
  if (!edit) {
    return <>{money(value)}{note}{pending && <> <Pill tone="a">{mgr ? `asked: ${money(pending.to)}` : `waiting for the manager: ${money(pending.to)}`}</Pill>{mgr && onDecide && <> <button type="button" className="lnk" onClick={() => onDecide(pending.id, true)}>Approve</button> <button type="button" className="lnk" onClick={() => onDecide(pending.id, false)}>Reject</button></>}</>}
      {canEdit && <> <button type="button" className="lnk" onClick={() => { setV(String(value)); setEdit(true); }}>Edit</button></>}</>;
  }
  const save = async () => {
    const price = parseFloat(v);
    const saved = await onSave(price);
    if (saved) {
      setEdit(false);
      // beyond the limit the price does not change yet: it is a request the manager decides
      if (!mgr && (saved.price_reqs || []).some(x => x.status === 'Requested' && Math.abs(x.to - price) < 0.005)) say(`A price more than ${db.cfg.priceLimitPct}% from the list price needs the manager's approval. The request was sent; the price changes when the manager approves.`);
    }
  };
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <input aria-label="Selling price" type="number" min="0" step="any" value={v} autoFocus style={{ width: 110 }} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
      <Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={() => setEdit(false)}>Cancel</Btn>
    </span>
  );
}

// Claim number, expected finish date and priority. The Service Advisor can change them until the invoice is issued.
function DetailsBox({ job: j }) {
  const { run } = useApp();
  const [f, setF] = useState({ claim_no: j.claim_no || '', due_date: j.due_date || '', priority: j.priority || 'Normal' });
  const dirty = f.claim_no !== (j.claim_no || '') || f.due_date !== (j.due_date || '') || f.priority !== (j.priority || 'Normal');
  const set = patch => setF(s => ({ ...s, ...patch }));
  return (
    <div className="row mt">
      <Field label="Insurance claim no (if any)" value={f.claim_no} onChange={e => set({ claim_no: e.target.value })} />
      <Field label="Expected finish date" type="date" value={f.due_date} onChange={e => set({ due_date: e.target.value })} />
      <Field label="Priority"><select value={f.priority} onChange={e => set({ priority: e.target.value })}><option>Normal</option><option>Urgent</option></select></Field>
      <Btn kind="ol" disabled={!dirty} onClick={() => run(() => put(j.id, '/details', f))}>Save details</Btn>
    </div>
  );
}

// Who the invoice is made out to: the customer, or an insurance company from the list. The Service Advisor can change it until the invoice is issued.
function PayerBox({ job: j }) {
  const { db, run, cust } = useApp();
  const current = (db.ins || []).find(x => x.name === j.payer)?.id || '';
  const [edit, setEdit] = useState(false), [ins, setIns] = useState(current), [policy, setPolicy] = useState(j.policy_no || '');
  const label = j.payer ? <><b>{j.payer}</b>{j.policy_no ? ` (policy ${j.policy_no})` : ''}</> : <b>{cust(j.cid).name} (the customer)</b>;
  if (!edit) return <p className="mu">Invoice made out to: {label} <button type="button" className="lnk" onClick={() => { setIns(current); setPolicy(j.policy_no || ''); setEdit(true); }}>Change</button></p>;
  const save = async () => { const r = await run(() => put(j.id, '/payer', { insurer_id: ins, policy_no: policy })); if (r.ok) setEdit(false); };
  return (
    <div className="box mt">
      <b>Invoice made out to</b>
      <div className="row mt">
        <Field label="Bill to"><select value={ins} onChange={e => setIns(e.target.value)}>
          <option value="">The customer ({cust(j.cid).name})</option>{(db.ins || []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select></Field>
        {ins && <Field label="Policy no" value={policy} onChange={e => setPolicy(e.target.value)} />}
        <Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={() => setEdit(false)}>Cancel</Btn>
      </div>
      <div className="mu small">The invoice and the proforma print this name. It can be changed until the invoice is issued.</div>
    </div>
  );
}

function MileageEdit({ job: j }) {
  const { run } = useApp();
  const [v, setV] = useState(null);   // null = not editing
  if (v === null) return <> <button type="button" className="lnk" onClick={() => setV(String(j.mileage ?? 0))}>Change</button></>;
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', display: 'inline-flex' }}>
      <input aria-label="Mileage (km)" type="number" min="0" value={v} autoFocus style={{ width: 120 }} onChange={e => setV(e.target.value)} />
      <Btn onClick={async () => { const r = await run(() => put(j.id, '/mileage', { mileage: parseFloat(v) })); if (r.ok) setV(null); }}>Save</Btn>
      <Btn kind="ol" onClick={() => setV(null)}>Cancel</Btn>
    </span>
  );
}

// Type A / B / C: one click adds the package's labour and parts. The suggestion comes from the vehicle's mileage and its last completed service.
function ServicePanel({ job: j, vehicle: v, types }) {
  const { run } = useApp();
  const sug = suggestService(v, j.mileage, types), added = j.services || [];
  return (
    <div className="box mt">
      <b>Service needed?</b>
      {sug && <div className="mu">At {km(j.mileage)} the suggestion is <b>{sug.name}</b> (due at {km(sug.km)}{sug.planned ? ', planned at the last service' : ''}).</div>}
      <div className="row mt">
        {types.map(t => (
          <Btn key={t.code} kind={sug?.code === t.code ? '' : 'ol'} disabled={added.includes(t.code)} onClick={() => run(() => post(j.id, '/service', { code: t.code }))}>
            {added.includes(t.code) ? `${t.name} added` : `Add ${t.name}`} <span className="mu small">({km(t.interval_km)})</span>
          </Btn>
        ))}
      </div>
      <div className="mu small">Adds the package's labour (priced from its hours) and its parts (issued from stock). You can still change any price below.</div>
    </div>
  );
}

// Body & Paints: type or pick an estimate number to bring all its labour and parts onto the card, or skip it and add everything by hand.
function EstimateLoader({ job: j, estimates }) {
  const { run, openModal, say } = useApp();
  const [no, setNo] = useState('');
  if (j.est) return <p className="mu">Estimate <b>{j.est}</b> is loaded on this card: its labour and parts are listed below.</p>;
  const mine = estimates.filter(e => e.vid === j.vid), ready = mine.filter(e => e.status === 'Finalized' && !e.used_in), drafts = mine.filter(e => e.status === 'Draft');
  const load = async () => {
    if (!no.trim()) return say('Type or pick an estimate number first.');
    const r = await run(() => post(j.id, '/estimate', { no: no.trim() }));
    if (r.ok) setNo('');
  };
  const create = async () => { const r = await run(() => api('/estimates', 'POST', { cid: j.cid, vid: j.vid })); if (r.ok) openModal('estimate', { id: r.data.id, jid: j.id }); };
  return (
    <div className="box">
      <b>Body &amp; Paints: load an estimate</b>
      <div className="row mt">
        <Field label="Estimate number" grow="2 1 220px" list="est-list" autoComplete="off" placeholder="EST-…" value={no} onChange={e => setNo(e.target.value)} />
        <Btn onClick={load}>Load estimate</Btn><Btn kind="ol" onClick={create}>New estimate for this vehicle</Btn>
      </div>
      <datalist id="est-list">{ready.map(e => <option key={e.id} value={e.id}>{e.note}</option>)}</datalist>
      <div className="mu small">
        Loads every labour and part line of a finalized estimate, at the estimate's prices. Or leave this empty and add labour and parts by hand below.
        {drafts.length > 0 && <> Still draft: {drafts.map((d, i) => <span key={d.id}>{i > 0 && ', '}<button type="button" className="lnk" onClick={() => openModal('estimate', { id: d.id, jid: j.id })}>{d.id}</button></span>)}.</>}
      </div>
    </div>
  );
}

function LabourRow({ job: j, l, canClock, canStop, canRemove, priceOpen, mgr }) {
  const { run, db } = useApp();
  const [reason, setReason] = useState('Completed');
  // A Type A/B/C package is clocked as one job, on its first line; every other task is clocked on its own line
  const lead = !l.svc || j.labours.find(x => x.svc === l.svc) === l, packName = l.svc ? (db.st || []).find(t => t.code === l.svc)?.name || `Type ${l.svc}` : '';
  const a = activeClock(l), base = `/jobs/${j.id}/labour/${l.id}`;
  return (
    <tr>
      <td><b title={l.section}>{SECTION_CODE[l.section]}</b> {l.desc}
        {l.svc && lead && <span className="mu small"> · {packName}: clocked once for the whole package</span>}
        {l.svc && !lead && <span className="mu small"> · part of the {packName} clock</span>}
        {l.late && <span className="mu small"> · added after the work</span>}
        {l.done ? <> <Pill tone="g">completed</Pill></> : a ? <> <Pill tone="a">{a.tech} working</Pill></> : null}</td>
      <td><PriceCell value={l.price} canEdit={priceOpen} onSave={async price => { const r = await run(() => put(j.id, `/labour/${l.id}/price`, { price })); return r.ok ? r.data : false; }}
        note={l.list !== undefined && l.list !== l.price ? <span className="mu small"> (was {money(l.list)})</span> : null}
        pending={(j.price_reqs || []).find(r => r.status === 'Requested' && r.kind === 'labour' && r.key === l.id)} mgr={mgr} onDecide={(rid, ok) => run(() => post(j.id, `/price-requests/${rid}/${ok ? 'approve' : 'reject'}`))} /></td>
      <td>{lead ? `${labourHours(l).toFixed(2)} h` : ''}</td>
      <td className="acts">
        {canClock && lead && (a ? <>
          <select aria-label="Clock-out reason" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 'auto' }}>{CLOCK_REASONS.map(r => <option key={r}>{r}</option>)}</select>
          <Btn kind="gr" onClick={() => run(() => api(base + '/clockout', 'POST', { reason }))}>Clock out</Btn>
          {canStop && <Btn kind="ol" onClick={() => run(() => api(base + '/clockout', 'POST', { reason: 'Supervisor command' }))}>Supervisor stop</Btn>}
        </> : <Btn onClick={() => run(() => api(base + '/clockin', 'POST'))}>Clock in</Btn>)}
        {canRemove && <Btn kind="ol" onClick={() => run(() => api(base, 'DELETE'))}>Remove</Btn>}
      </td>
    </tr>
  );
}

// Pick a task from the labour list (BP / ME / SV): its section, hours and cost fill themselves. Or type any work and its hours.
// The cost is hours x labour rate unless the task has a fixed price, and it can still be typed over.
const groupLabelText = g => `▤ ${g.name}`;
function LabourForm({ id, rate, known, late, services }) {
  const { run, say } = useApp();
  const groups = [...groupTasks(known), ...serviceGroups(services)];
  const [f, bind, set, reset] = useForm(`form:${id}:labour`, { desc: '', section: '', hours: '', price: '' });
  const priceFor = (h, section = f.section) => r2((parseFloat(h) || 0) * rateOf(rate, section)) || '';   // hours x the rate of the section
  // A task picked by its name adds all its lines to the card, one after the other
  const addGroup = async g => {
    for (const l of groupLines(g, rate)) {
      const r = await run(() => post(id, '/labour', { desc: l.desc, section: l.section, price: parseFloat(l.price) || 0, hours: parseFloat(l.hours) || 0 }));
      if (!r.ok) return;
    }
    reset(); say?.(`Added all ${g.items.length} line(s) of "${g.name}".`);
  };
  const singles = known.filter(x => !x.task);
  const picked = h => {
    if (h.kind === 'group') { set({ desc: groupLabelText(h.g) }); return addGroup(h.g); }
    const k = h.t;
    set({ desc: taskDesc(k), section: k.section, hours: k.hours || '', price: k.price || priceFor(k.hours, k.section) });
  };
  const chosen = !!f.desc.trim() && isListed(known, groups)(f.desc);
  const add = async () => {
    if (!f.section) return say?.('Choose the section first.');
    if (!f.desc.trim()) return;
    if (!chosen) return say?.('Choose the labour task from the list: type a letter of its code or name and pick one.');
    const r = await run(() => post(id, '/labour', { desc: f.desc, section: f.section, price: parseFloat(f.price) || 0, hours: parseFloat(f.hours) || 0 }));
    if (r.ok) reset();
  };
  return (
    <>
      <div className="row mt">
        <div style={{ flex: '3 1 260px' }}><label>Labour task (type a letter of the code or task name)<TaskSearch groups={groups} singles={singles} section={f.section} disabled={!f.section} value={f.desc} onChange={text => set({ desc: text })} onPick={picked} invalid={!!f.desc.trim() && !chosen} /></label></div>
        <Field label="Section (choose first)"><select value={f.section} onChange={e => set({ section: e.target.value, desc: '', hours: '', price: '' })}>{!f.section && <option value="">Choose section…</option>}{SECTIONS.map(s => <option key={s} value={s}>{sectionOption(s)}</option>)}</select></Field>
        <Field label="Hours" type="number" min="0" step="0.25" value={f.hours} onChange={e => set({ hours: e.target.value, price: priceFor(e.target.value) })} />
        <Field label={`Labour cost (ETB) · ${rateOf(rate, f.section)}/h`} type="number" min="0" {...bind('price')} />
        <Btn onClick={add}>Add labour</Btn>
      </div>
      <div className="mu small">
        {f.price ? `Labour cost: ETB ${money(f.price)}${f.hours ? ` (${f.hours} h x ${rateOf(rate, f.section)})` : ''}. Type another amount to change it.` : 'Choose the section, then type a letter and pick a task from the list (▤ adds all its lines); its section, hours and cost fill themselves.'}
        {late && ' The card is not in the workshop: this is added as a billing line. To have it done, return the card to the workshop first.'}
      </div>
    </>
  );
}

// Typing a code or name picks from the stock list: its price appears by itself and the quantity leaves stock. The Service Advisor can type another selling price.
// Anything not in the list is free text with a typed price and is not tracked.
function PartForm({ id, stock }) {
  const { run, say } = useApp();
  const [f, bind, set, reset] = useForm(`form:${id}:part`, { name: '', qty: 1, price: '', wait: false });
  const p = matchPart(stock, f.name), qty = parseFloat(f.qty) || 1;
  const shown = f.price !== '' ? f.price : p ? p.price : '';
  // a part the customer asked for that is not in the stock list: written down as a lost sale
  const lost = async name => { const r = await run(() => api('/lost-sales', 'POST', { name, qty, source: 'Job card', ref: id, reason: 'Not in the stock list' })); if (r.ok) { say(`Lost sale recorded: ${name}`); set({ name: '', price: '' }); } };
  const add = async () => {
    if (!f.name.trim()) return;
    const r = await run(() => post(id, '/parts', p ? { pid: p.id, qty, ...(f.price !== '' && { price: parseFloat(f.price) }), ...(f.wait && p.stock < qty && { waiting: true }) } : { name: f.name.trim(), qty, price: parseFloat(f.price) || 0 }));
    if (r.ok) reset();
  };
  return (
    <>
      <div className="row mt">
        <PartSearch label="Part (type the part number or description)" grow="3 1 200px" stock={stock} value={f.name} onChange={name => set({ name, price: '' })} onPick={x => set({ name: `${x.code} · ${x.name}`, price: '' })} onMissing={lost} />
        <Field label="Qty" type="number" min="0.01" step="any" {...bind('qty')} />
        <Field label="Selling price (ETB)" type="number" min="0" value={shown} onChange={bind('price').onChange} />
        <Btn onClick={add}>Issue part</Btn>
      </div>
      <div className="mu small">
        {p ? `${p.stock} in stock · list price ${money(p.price)} filled in. Line total ETB ${money(qty * (parseFloat(shown) || 0))}.`
          : f.name ? 'Not in the stock list: stock will not be tracked for this line. Type its selling price.' : ''}
      </div>
      {p && p.stock < qty && <label className="mu small" style={{ display: 'block' }}><input type="checkbox" checked={!!f.wait} onChange={e => set({ wait: e.target.checked })} style={{ width: 'auto' }} /> Only {p.stock} in stock: add it as <b>waiting for stock</b> (nothing leaves stock until it is received).</label>}
    </>
  );
}

// Additional parts: the workshop asks, only the Service Advisor issues. The Service Advisor can match the request to a stock part and sets the price.
function PartRequests({ job: j, stock, canAsk, canIssue }) {
  const requests = j.requests || [];
  return (
    <>
      <h3 className="mt">Additional parts</h3>
      <p className="mu small">The workshop asks for extra parts here. Only the Service Advisor issues them (from stock, with the selling price), so a mechanic cannot take parts by himself.</p>
      <Table head={['Requested part', 'Qty', 'Asked by', 'Status', '']} empty={!requests.length && 'No requests yet.'}>
        {requests.map(r => <RequestRow key={r.id} job={j} r={r} stock={stock} canIssue={canIssue} />)}
      </Table>
      {canAsk && <RequestForm id={j.id} stock={stock} />}
    </>
  );
}

function RequestForm({ id, stock }) {
  const { run } = useApp();
  const [f, bind, set, reset] = useForm(`form:${id}:request`, { name: '', qty: 1, pid: '' });
  const ask = async () => {
    if (!f.name.trim()) return;
    const r = await run(() => post(id, '/requests', { ...(f.pid ? { pid: f.pid } : { name: f.name.trim() }), qty: parseFloat(f.qty) || 1 }));
    if (r.ok) reset();
  };
  return (
    <div className="row mt">
      <PartSearch label="Part needed (type the part number or description)" grow="3 1 200px" remote value={f.name} onChange={name => set({ name, pid: '' })} onPick={x => set({ name: `${x.code} · ${x.name}`, pid: x.id })} />
      <Field label="Qty" type="number" min="0.01" step="any" {...bind('qty')} />
      <Btn onClick={ask}>Ask Service Advisor</Btn>
    </div>
  );
}

function RequestRow({ job: j, r, stock, canIssue }) {
  const { run, say } = useApp();
  const [name, setName] = useState(r.code ? `${r.code} · ${r.name}` : r.name), [price, setPrice] = useState('');
  const p = matchPart(stock, name), base = `/jobs/${j.id}/requests/${r.id}`;
  const issue = () => {
    if (!p && price === '') return say('This part is not in the stock list: type its selling price.');
    return run(() => api(base + '/issue', 'POST', { ...(p && { pid: p.id }), ...(price !== '' && { price: parseFloat(price) }) }));
  };
  return (
    <tr>
      <td>{r.name}</td><td>{r.qty}</td><td>{r.by}<br /><span className="mu small">{dt(r.t)}</span></td>
      <td>{r.status === 'Requested' ? <Pill tone="a">waiting for Service Advisor</Pill> : <Pill tone={r.status === 'Issued' ? 'g' : ''}>{r.status.toLowerCase()}</Pill>}{r.by2 && <span className="mu small"> {r.by2}</span>}</td>
      <td>{canIssue && r.status === 'Requested' && (
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <PartSearch aria-label="Stock part" grow="1 1 220px" stock={stock} value={name} onChange={setName} onPick={x => setName(`${x.code} · ${x.name}`)} />
          <input aria-label="Selling price" type="number" min="0" step="any" placeholder={p ? `${money(p.price)}` : 'price'} value={price} style={{ width: 90 }} onChange={e => setPrice(e.target.value)} />
          <Btn onClick={issue}>Issue</Btn><Btn kind="ol" onClick={() => run(() => api(base + '/reject', 'POST'))}>Reject</Btn>
        </div>
      )}</td>
    </tr>
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
