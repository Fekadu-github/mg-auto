import ApprovalBox from '../components/ApprovalBox.jsx';
import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, SaveState, Table } from '../components/ui.jsx';
import { isAdmin, isMgr, isSA, SECTION_CODE } from '../lib/constants.js';
import { LabourLines, PartLines } from '../components/Lines.jsx';
import { restoreDraft, useAutosave } from '../lib/autosave.js';
import { dt, money, pct, r2, rateOf, tot, vehicleName, cur, discNote } from '../lib/format.js';
import { usePrint } from '../print/PrintHost.jsx';
import EstimateDoc, { estimateProps } from '../print/EstimateDoc.jsx';
import { downloadEstimatePdf } from '../lib/estimatePdf.js';
import { downloadXlsx } from '../lib/xlsx.js';
import { estimateRows } from '../lib/estimateExport.js';
import ReferralDiscount from '../components/ReferralDiscount.jsx';

const num = v => parseFloat(v) || 0;
const Total = ({ t }) => (
  <div className="box mt r">
    Labour {money(t.l)} · Parts {money(t.p)}{t.disc ? <> · <b>Referral discount −{money(t.disc)}</b></> : null} · VAT {pct(t.rate)}% {money(t.vat)}
    <br /><b className="cn total">Estimate total {cur()} {money(t.total)}</b>
    {t.disc ? <div className="mu small">{discNote(t.discRef)}</div> : null}
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
  const t = tot({ labours: shownLabs.map(l => ({ price: num(l.price) })), parts: shownParts.map(p => ({ qty: num(p.qty), price: num(p.price) })), disc: e.disc }, vat);

  // What is printed or downloaded: exactly what is on the screen, draft or finalized (an empty labour cost counts hours x rate, as the server does when saving)
  const doc = () => ({
    ...e, note: edit ? note : e.note,
    labours: shownLabs.filter(l => l.desc?.trim()).map(l => ({ ...l, price: num(l.price) || r2(num(l.hours) * rateOf(rate, l.section)) })),
    parts: shownParts.filter(p => p.name?.trim())
  });
  const ready = async () => { if (edit && !(await flush())) { say('The draft is not saved yet. Wait a moment and try again.'); return false; } return true; };
  // An estimate made from a proforma prints that proforma's insurance company, claim and policy; a walk-in's name and vehicle come from the proforma too
  const src = e.pro ? db.pr.find(x => x.id === e.pro) : null, srcIns = src?.insurer_id ? db.ins.find(x => x.id === src.insurer_id) : undefined, walkIn = !e.cid;
  const gs = walkIn ? (e.guest_name || e.guest_plate ? e : src) : null;   // the walk-in's own details, else the proforma's
  const docC = gs ? { name: gs.guest_name, phone: gs.guest_phone } : c, docV = gs ? { plate: gs.guest_plate, brand: gs.guest_brand, model: gs.guest_model, vin: gs.guest_vin, eng: gs.guest_eng } : v;
  const linked = db.pr.find(x => x.id === e.id && x.status !== 'Converted');   // the proforma made from this estimate (same EST number)
  const docProps = () => ({ est: doc(), customer: docC, vehicle: docV, pro: src, insurer: srcIns, walkIn, garage: db.cfg.garage, vat });
  const printIt = async () => { if (await ready()) print(<EstimateDoc {...docProps()} />, 'a4', e.id); };   // the number is the file name if it is saved as PDF from the print window
  const pdfIt = async () => { if (await ready()) { try { await downloadEstimatePdf(estimateProps(docProps())); } catch (err) { say('The PDF could not be made: ' + (err?.message || err)); } } };
  const download = async () => { if (await ready()) downloadXlsx(`${e.id}-${e.status.toLowerCase()}.xlsx`, estimateRows(doc(), { customer: c, vehicle: v, vat }), 'Estimate'); };
  // A decision (finalize, back to draft) closes this window and shows the list, so there is nothing to close by hand; from a job card it returns to the card
  const done = msg => { say(msg); if (jid) openModal('job', { id: jid }); else { closeModal(); goPage('est'); } };
  // Save: store the draft, then go straight to the list (or back to the job card it was opened from), so there is no need to press Close
  const save = async () => { if (!(await flush())) return say('The draft is not saved yet. Wait a moment and try again.'); done(`${e.id} saved.`); };
  const finalize = async () => {
    if (!(await flush())) return say('The draft is not saved yet. Wait a moment and try again.');
    const r = await run(() => api(`/estimates/${e.id}/finalize`, 'POST'));
    if (!r.ok) return;
    // Made from a job card: bring its labour and parts onto that card at once, so the card's total is the estimate plus anything added by hand
    const jb = jid && job(jid);
    if (jb && !jb.est && !jb.inv && !linked) {
      const l = await run(() => api(`/jobs/${jid}/estimate`, 'POST', { no: e.id }));
      if (l.ok) { say(`${e.id} finalized and loaded on ${jid}.`); return openModal('job', { id: jid }); }
    }
    done(`${e.id} finalized${linked ? ` and its proforma ${e.id} finalized with it` : ''}.`);
  };
  const reopen = async () => { const r = await run(() => api(`/estimates/${e.id}/draft`, 'POST')); if (r.ok) done(`${e.id} is back to draft${linked ? ` (its proforma is back to draft too)` : ''}.`); };
  const remove = async () => { if (!confirm(`Delete ${draft ? 'draft ' : ''}estimate ${e.id}?`)) return; const r = await run(() => api('/estimates/' + e.id, 'DELETE')); if (r.ok) { if (jid) openModal('job', { id: jid }); else { closeModal(); goPage('est'); } } };
  const loadOnJob = async () => { const r = await run(() => api(`/jobs/${jid}/estimate`, 'POST', { no: e.id })); if (r.ok) openModal('job', { id: jid }); };

  return (
    <Dialog title={<>{e.id} <Pill tone={draft ? 'a' : 'g'}>{e.status}</Pill></>} onClose={closeModal}>
      <div className="g g2">
        {e.cid ? <div className="box"><b>{c.name}</b> <span className="mu">{c.id}</span><br />{c.phone}</div> : <div className="box"><Pill tone="a">No customer yet</Pill>{gs?.guest_name && <> <b>{gs.guest_name}</b> <span className="mu">{gs.guest_phone}</span></>}<br /><span className="mu small">Finalize it, then pick it by its number ({e.id}) when the job card is created: the customer and vehicle are added then.</span></div>}
        <div className="box">{e.vid ? <><b>{v.plate}</b> · {vehicleName(v)}</> : gs?.guest_plate ? <><b>{gs.guest_plate}</b> · {[gs.guest_brand, gs.guest_model].filter(Boolean).join(' ')}{gs.guest_vin && <><br /><span className="mu">Chassis {gs.guest_vin}{gs.guest_eng ? ` · Motor ${gs.guest_eng}` : ''}</span></>}</> : <span className="mu">No vehicle yet</span>}<br /><span className="mu">Body &amp; Paints estimate · made {dt(e.created)}</span></div>
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
      <ReferralDiscount docId={e.id} disc={e.disc} customerId={e.cid} editable={sa && !e.used_in} />
      {!draft && isSA(me) && <ApprovalBox kind="estimate" id={e.id} />}
      <div className="row mt">
        <Btn kind="ol" onClick={printIt}>Print estimate (A4)</Btn>
        <Btn kind="ol" onClick={pdfIt}>Download PDF</Btn>
        <Btn kind="ol" onClick={download}>Download (Excel)</Btn>
        {edit && <><Btn onClick={save}>Save</Btn><Btn kind="gr" onClick={finalize}>Finalize estimate</Btn>{isAdmin(me) && <Btn kind="ol" onClick={remove}>Delete draft</Btn>}</>}
        {isAdmin(me) && !draft && !e.used_in && <Btn kind="ol" onClick={remove}>Delete estimate</Btn>}
        {sa && !draft && !e.used_in && jc && jc.status === 'Created' && !jc.est && (!e.vid || jc.vid === e.vid) && <Btn kind="gr" onClick={loadOnJob}>Load on {jid}</Btn>}
        {isMgr(me) && !draft && !e.used_in && <Btn kind="ol" onClick={reopen}>Back to draft</Btn>}
        {jid && <Btn kind="ol" onClick={() => openModal('job', { id: jid })}>Back to job card {jid}</Btn>}
      </div>
      {edit && <div className="mt"><SaveState state={state} restored={init.restored} /></div>}
      {edit && <p className="mu small">Finalize locks the estimate{linked ? <>, and its proforma {e.id} is finalized with it (same lines)</> : ''}. A finalized estimate is picked by its number when the job card is created, or in the job card's Labour section (type a letter and the list appears).</p>}
      {!draft && linked && <p className="mu small">Its proforma {e.id} is {linked.status === 'Issued' ? 'finalized' : 'still a draft'}. <button type="button" className="lnk" onClick={() => openModal('proforma', { id: e.id })}>Open proforma</button></p>}
    </Dialog>
  );
}
