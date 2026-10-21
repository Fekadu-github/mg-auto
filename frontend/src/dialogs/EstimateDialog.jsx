import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, SaveState, Table } from '../components/ui.jsx';
import { isAdmin, isSA, SECTION_CODE } from '../lib/constants.js';
import { LabourLines, PartLines } from '../components/Lines.jsx';
import { restoreDraft, useAutosave } from '../lib/autosave.js';
import { dt, money, pct, r2, rateOf, tot, vehicleName } from '../lib/format.js';
import { usePrint } from '../print/PrintHost.jsx';
import EstimateDoc from '../print/EstimateDoc.jsx';
import { downloadXlsx } from '../lib/xlsx.js';
import { estimateRows } from '../lib/estimateExport.js';

const num = v => parseFloat(v) || 0;
const Total = ({ t }) => (
  <div className="box mt r">
    Labour {money(t.l)} · Parts {money(t.p)} · VAT {pct(t.rate)}% {money(t.vat)}
    <br /><b className="cn total">Estimate total ETB {money(t.total)}</b>
  </div>
);

// A body & paint estimate. Draft: labour and parts can be changed (prices fill themselves, and can be typed over). Finalized: locked.
// A finalized estimate is loaded on a job card by its number. `jid` is the job card this dialog was opened from, if any.
export default function EstimateDialog({ id, jid }) {
  const { db, me, run, say, refresh, openModal, closeModal, goPage, cust, veh, job } = useApp();
  const { print } = usePrint();
  const e = db.e.find(x => x.id === id);
  const [init] = useState(() => restoreDraft('est:' + id, e && e.status === 'Draft' ? { note: e.note || '', labours: e.labours, parts: e.parts } : null));
  const [note, setNote] = useState(init.value?.note || '');
  const [labs, setLabs] = useState(() => (init.value ? init.value.labours.map(l => ({ ...l })) : []));
  const [parts, setParts] = useState(() => (init.value ? init.value.parts.map(p => ({ ...p })) : []));
  // The draft saves itself while it is edited (and a copy stays on this device); a power cut loses nothing
  const { state, flush } = useAutosave('est:' + id, { note, labours: labs, parts }, { enabled: !!e && isSA(me) && e.status === 'Draft', startDirty: init.restored, save: async v => { await api('/estimates/' + id, 'PUT', v); refresh().catch(() => {}); } });
  if (!e) return <Dialog title="Estimate" onClose={closeModal}><p className="mu">This estimate no longer exists.</p></Dialog>;

  const sa = isSA(me), draft = e.status === 'Draft', edit = sa && draft, rate = db.cfg.labourRates || db.cfg.labourRate, vat = db.cfg.vat;
  const c = cust(e.cid), v = veh(e.vid), jc = jid && job(jid);
  const shownLabs = edit ? labs : e.labours, shownParts = edit ? parts : e.parts;
  const t = tot({ labours: shownLabs.map(l => ({ price: num(l.price) })), parts: shownParts.map(p => ({ qty: num(p.qty), price: num(p.price) })) }, vat);

  // What is printed or downloaded: exactly what is on the screen, draft or finalized (an empty labour cost counts hours x rate, as the server does when saving)
  const doc = () => ({
    ...e, note: edit ? note : e.note,
    labours: shownLabs.filter(l => l.desc?.trim()).map(l => ({ ...l, price: num(l.price) || r2(num(l.hours) * rateOf(rate, l.section)) })),
    parts: shownParts.filter(p => p.name?.trim())
  });
  const ready = async () => { if (edit && !(await flush())) { say('The draft is not saved yet. Wait a moment and try again.'); return false; } return true; };
  // An estimate made from a proforma prints that proforma's insurance company, claim and policy; a walk-in's name and vehicle come from the proforma too
  const src = e.pro ? db.pr.find(x => x.id === e.pro) : null, srcIns = src?.insurer_id ? db.ins.find(x => x.id === src.insurer_id) : undefined, walkIn = !e.cid;
  const docC = walkIn && src ? { name: src.guest_name, phone: src.guest_phone } : c, docV = walkIn && src ? { plate: src.guest_plate, brand: src.guest_brand, model: src.guest_model } : v;
  const linked = db.pr.find(x => x.id === e.id && x.status !== 'Converted');   // the proforma made from this estimate (same EST number)
  const printIt = async () => { if (await ready()) print(<EstimateDoc est={doc()} customer={docC} vehicle={docV} pro={src} insurer={srcIns} walkIn={walkIn} garage={db.cfg.garage} vat={vat} />, 'a4'); };
  const download = async () => { if (await ready()) downloadXlsx(`${e.id}-${e.status.toLowerCase()}.xlsx`, estimateRows(doc(), { customer: c, vehicle: v, vat }), 'Estimate'); };
  const save = async () => { if (!(await flush())) say('The draft is not saved yet. Wait a moment and try again.'); };
  // A decision (finalize, back to draft) closes this window and shows the list, so there is nothing to close by hand; from a job card it returns to the card
  const done = msg => { say(msg); if (jid) openModal('job', { id: jid }); else { closeModal(); goPage('est'); } };
  const finalize = async () => {
    if (!(await flush())) return say('The draft is not saved yet. Wait a moment and try again.');
    const r = await run(() => api(`/estimates/${e.id}/finalize`, 'POST'));
    if (r.ok) done(`${e.id} finalized${linked ? ` and its proforma ${e.id} finalized with it` : ''}.`);
  };
  const reopen = async () => { const r = await run(() => api(`/estimates/${e.id}/draft`, 'POST')); if (r.ok) done(`${e.id} is back to draft${linked ? ` (its proforma is back to draft too)` : ''}.`); };
  const remove = async () => { if (!confirm(`Delete ${draft ? 'draft ' : ''}estimate ${e.id}?`)) return; const r = await run(() => api('/estimates/' + e.id, 'DELETE')); if (r.ok) { if (jid) openModal('job', { id: jid }); else { closeModal(); goPage('est'); } } };
  const loadOnJob = async () => { const r = await run(() => api(`/jobs/${jid}/estimate`, 'POST', { no: e.id })); if (r.ok) openModal('job', { id: jid }); };

  return (
    <Dialog title={<>{e.id} <Pill tone={draft ? 'a' : 'g'}>{e.status}</Pill></>} onClose={closeModal}>
      <div className="g g2">
        {e.cid ? <div className="box"><b>{c.name}</b> <span className="mu">{c.id}</span><br />{c.phone}</div> : <div className="box"><Pill tone="a">No customer yet</Pill><br /><span className="mu small">Finalize it, then pick it by its number ({e.id}) when the job card is created: the customer and vehicle are added then.</span></div>}
        <div className="box">{e.vid ? <><b>{v.plate}</b> · {vehicleName(v)}</> : <span className="mu">No vehicle yet</span>}<br /><span className="mu">Body &amp; Paints estimate · made {dt(e.created)}</span></div>
      </div>
      {edit ? <Field label="Damage / work description" value={note} onChange={x => setNote(x.target.value)} /> : e.note && <p className="mu">Notes: {e.note}</p>}
      {!draft && e.finalized_at && <p className="mu">Finalized {dt(e.finalized_at)}{e.by_name ? ` by ${e.by_name}` : ''}.{e.used_in ? ` Loaded on ${e.used_in}.` : ' Not loaded on a job card yet.'}</p>}

      <h3 className="mt">Labour</h3>
      {edit ? <LabourLines labs={labs} setLabs={setLabs} tasks={db.lt} services={db.st} rate={rate} brand={docV.brand} /> : (
        <Table head={['Work', 'Section', { t: 'Hours', r: 1 }, { t: 'Cost', r: 1 }]} empty={!e.labours.length && 'No labour.'}>
          {e.labours.map((l, i) => <tr key={i}><td>{l.desc}</td><td>{SECTION_CODE[l.section] || ''}</td><td className="r">{l.hours || ''}</td><td className="r">{money(l.price)}</td></tr>)}
        </Table>
      )}

      <h3 className="mt">Parts</h3>
      {edit ? <PartLines parts={parts} setParts={setParts} stock={db.p} /> : (
        <Table head={['Part', { t: 'Qty', r: 1 }, { t: 'Selling price', r: 1 }, { t: 'Total', r: 1 }]} empty={!e.parts.length && 'No parts.'}>
          {e.parts.map((p, i) => <tr key={i}><td>{p.code && <span className="mu">{p.code} </span>}{p.name}</td><td className="r">{p.qty}</td><td className="r">{money(p.price)}</td><td className="r">{money(p.qty * p.price)}</td></tr>)}
        </Table>
      )}

      <Total t={t} />
      <div className="row mt">
        <Btn kind="ol" onClick={printIt}>Print estimate (A4)</Btn>
        <Btn kind="ol" onClick={download}>Download (Excel)</Btn>
        {edit && <><Btn onClick={save}>Save now</Btn><Btn kind="gr" onClick={finalize}>Finalize estimate</Btn><Btn kind="ol" onClick={remove}>Delete draft</Btn></>}
        {isAdmin(me) && !draft && !e.used_in && <Btn kind="ol" onClick={remove}>Delete estimate</Btn>}
        {sa && !draft && !e.used_in && jc && jc.status === 'Created' && !jc.est && (!e.vid || jc.vid === e.vid) && <Btn kind="gr" onClick={loadOnJob}>Load on {jid}</Btn>}
        {sa && !draft && !e.used_in && <Btn kind="ol" onClick={reopen}>Back to draft</Btn>}
        {jid && <Btn kind="ol" onClick={() => openModal('job', { id: jid })}>Back to job card {jid}</Btn>}
      </div>
      {edit && <div className="mt"><SaveState state={state} restored={init.restored} /></div>}
      {edit && <p className="mu small">Finalize locks the estimate{linked ? <>, and its proforma {e.id} is finalized with it (same lines)</> : ''}. A finalized estimate is picked by its number when the job card is created, or in the job card's Labour section (type a letter and the list appears).</p>}
      {!draft && linked && <p className="mu small">Its proforma {e.id} is {linked.status === 'Issued' ? 'finalized' : 'still a draft'}. <button type="button" className="lnk" onClick={() => openModal('proforma', { id: e.id })}>Open proforma</button></p>}
    </Dialog>
  );
}
