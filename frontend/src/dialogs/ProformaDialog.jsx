import ApprovalBox from '../components/ApprovalBox.jsx';
import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, SaveState } from '../components/ui.jsx';
import { LabourLines, PartLines } from '../components/Lines.jsx';
import CustomerPicker from '../components/CustomerPicker.jsx';
import { ROLES, isAdmin, isSA } from '../lib/constants.js';
import { restoreDraft, useAutosave } from '../lib/autosave.js';
import { dt, km, money, pct, rateOf, tot, vehicleName, cur } from '../lib/format.js';
import { usePrint } from '../print/PrintHost.jsx';
import ProformaDoc, { proformaProps } from '../print/ProformaDoc.jsx';
import { downloadEstimatePdf } from '../lib/estimatePdf.js';

const r2 = n => Math.round(n * 100) / 100;
const STATUS_LABEL = { Draft: 'Draft', Issued: 'Finalized' };   // the stored status is Issued; the screens say Finalized
const num = v => parseFloat(v) || 0;

// The first-hand (insurance) proforma, made before any job card. Everything auto-saves as you type (and a copy stays on this device),
// so a power cut loses nothing and it can be edited later. Issue -> print -> create the job card: the proforma then becomes the job card's estimate.
export default function ProformaDialog({ id }) {
  const { db, me, run, say, refresh, openModal, closeModal, goPage, cust, veh } = useApp();
  const { print } = usePrint();
  const p = db.pr.find(x => x.id === id);
  const fromServer = p && { guest_name: p.guest_name || '', guest_phone: p.guest_phone || '', guest_plate: p.guest_plate || '', guest_brand: p.guest_brand || '', guest_model: p.guest_model || '', guest_vin: p.guest_vin || '', guest_eng: p.guest_eng || '', insurer_id: p.insurer_id || '', policy_no: p.policy_no || '', estimator_id: p.estimator_id || '', pdate: p.pdate, note: p.note || '', claim_no: p.claim_no || '', priority: p.priority || '', due_date: p.due_date || '', terms: p.terms || '', labours: p.labours, parts: p.parts };
  const open = !!p && p.status !== 'Converted' && isSA(me);
  const [init] = useState(() => restoreDraft('pro:' + id, fromServer, p?.updated ? Date.parse(p.updated) : 0));   // a copy on this PC older than the server's is dropped
  const [f, setF] = useState(() => (init.value ? { ...init.value, labours: init.value.labours.map(l => ({ ...l })), parts: init.value.parts.map(x => ({ ...x })) } : null));
  const [km2, setKm] = useState(''), [ecid, setEcid] = useState(''), [evid, setEvid] = useState('');
  const { state, flush } = useAutosave('pro:' + id, f, { enabled: open && !!f, startDirty: init.restored, save: async v => { await api('/proformas/' + id, 'PUT', v); refresh().catch(() => {}); } });
  if (!p || !f) return <Dialog title="Proforma" onClose={closeModal}><p className="mu">This proforma no longer exists.</p></Dialog>;

  const walkIn = !p.cid;   // not registered yet: the customer and vehicle details live on the proforma itself
  const c = walkIn ? { name: f.guest_name, phone: f.guest_phone } : cust(p.cid), v = walkIn ? { plate: f.guest_plate, brand: f.guest_brand, model: f.guest_model, vin: f.guest_vin, eng: f.guest_eng } : veh(p.vid), rate = db.cfg.labourRates || db.cfg.labourRate, vat = db.cfg.vat, converted = p.status === 'Converted';
  const insurer = db.ins.find(x => x.id === f.insurer_id), estimator = db.staff.find(x => x.id === f.estimator_id);
  const set = patch => setF(s => ({ ...s, ...patch }));
  // The vehicle whose registered mileage is used: the proforma's own vehicle, or the one chosen from the linked customer's vehicles (a walk-in's written vehicle has no reading yet)
  const known = walkIn ? (ecid && evid ? db.v.find(x => x.id === evid) : null) : v, knownKm = known?.mileage ?? '';
  const pickCustomer = id => {   // choosing the customer also chooses his vehicle: the one with the plate written here, or his only vehicle
    const list = db.v.filter(x => x.cid === id), plate = f.guest_plate.trim().toLowerCase();
    const match = list.find(x => plate && String(x.plate).toLowerCase() === plate) || (list.length === 1 ? list[0] : null);
    setEcid(id); setEvid(match ? match.id : ''); setKm('');
  };
  const setLabs = fn => setF(s => ({ ...s, labours: fn(s.labours) })), setParts = fn => setF(s => ({ ...s, parts: fn(s.parts) }));
  const t = tot({ labours: f.labours.map(l => ({ price: num(l.price) })), parts: f.parts.map(x => ({ qty: num(x.qty), price: num(x.price) })) }, vat);
  const saved = async () => { if (await flush()) return true; say('The proforma is not saved yet. Wait a moment and try again.'); return false; };

  // What is printed: exactly what is on the screen (an empty labour cost counts hours x rate, as the server does when saving)
  const doc = () => ({
    ...p, ...f, estimator: estimator?.name || p.estimator, estimator_role: estimator?.role || p.estimator_role,
    labours: f.labours.filter(l => l.desc?.trim()).map(l => ({ ...l, price: num(l.price) || r2(num(l.hours) * rateOf(rate, l.section)) })), parts: f.parts.filter(x => x.name?.trim())
  });
  const docProps = () => ({ pro: doc(), customer: c, vehicle: v, insurer, walkIn, garage: db.cfg.garage, vat, roleName: r => ROLES[r] || r });
  const printIt = async () => { if (open && !(await saved())) return; print(<ProformaDoc {...docProps()} />, 'a4', p.id); };   // the number is the file name if it is saved as PDF from the print window
  const pdfIt = async () => { if (open && !(await saved())) return; try { await downloadEstimatePdf(proformaProps(docProps())); } catch (e) { say('The PDF could not be made: ' + (e?.message || e)); } };
  const linkedEst = db.e.find(x => x.id === id);   // the estimate with the same EST number
  // The decision closes this window and shows the Proformas list, so there is nothing to close by hand
  const issue = async () => {
    if (!(await saved())) return;
    const r = await run(() => api(`/proformas/${id}/issue`, 'POST'));
    if (r.ok) { say(`${id} finalized${linkedEst ? ` (estimate ${id} finalized with it)` : ''}.`); closeModal(); goPage('pro'); }
  };
  // Save: store the draft, then go straight to the Proformas list, so there is no need to press Close
  const save = async () => { if (!(await saved())) return; say(`${id} saved.`); closeModal(); goPage('pro'); };
  const remove = async () => { if (!confirm(`Delete ${p.status === 'Issued' ? 'finalized ' : ''}proforma ${id}?${p.status === 'Issued' ? '\nIts estimate stays and can be given a new proforma.' : ''}`)) return; const r = await run(() => api('/proformas/' + id, 'DELETE')); if (r.ok) { closeModal(); goPage('pro'); } };
  const makeJob = async () => {
    const mileage = km2 !== '' ? km2 : knownKm;
    if (mileage === '') return say('Enter the vehicle mileage (km).');
    const existing = walkIn && ecid ? db.c.find(x => x.id === ecid) : null;
    if (walkIn && !existing && (!f.guest_name.trim() || !f.guest_phone.trim() || !f.guest_plate.trim())) return say('To register him, write the customer name, phone and plate number first (or choose a customer already in the list).');
    if (existing && !evid && !f.guest_plate.trim()) return say('Choose his vehicle, or write the plate number to register a new one.');
    if (!confirm(`${walkIn ? (existing ? `Link to customer ${existing.name} and create` : `Register ${f.guest_name} (${f.guest_plate}) as a new customer and create`) : 'Create'} the job card from ${id}?\n\nIts labour and parts are loaded on the job card (stock parts leave stock now) and ${id} becomes the job card's estimate.`)) return;
    if (!(await saved())) return;
    const r = await run(() => api(`/proformas/${id}/convert`, 'POST', { mileage: parseFloat(mileage), ...(existing ? { cid: existing.id, ...(evid ? { vid: evid } : {}) } : {}) }));
    if (r.ok) openModal('job', { id: r.data.job });
  };

  return (
    <Dialog title={<>{p.id} <Pill tone={p.status === 'Draft' ? 'a' : 'g'}>{p.status === 'Converted' ? (p.job ? `became ${p.job}` : 'job card removed') : STATUS_LABEL[p.status] || p.status}</Pill></>} onClose={closeModal}>
      {walkIn && open ? <>
        <div className="box"><Pill tone="a">Not registered</Pill> <span className="mu small">Customer and vehicle are written here only. He is registered when you create the job card.</span></div>
        <div className="row mt">
          <Field label="Customer name" value={f.guest_name} onChange={e => set({ guest_name: e.target.value })} />
          <Field label="Phone" value={f.guest_phone} onChange={e => set({ guest_phone: e.target.value })} />
          <Field label="Plate no" value={f.guest_plate} onChange={e => set({ guest_plate: e.target.value })} />
          <Field label="Brand" value={f.guest_brand} onChange={e => set({ guest_brand: e.target.value })} />
          <Field label="Model" value={f.guest_model} onChange={e => set({ guest_model: e.target.value })} />
          <Field label="Chassis / VIN no" value={f.guest_vin} onChange={e => set({ guest_vin: e.target.value })} />
          <Field label="Engine / motor no" value={f.guest_eng} onChange={e => set({ guest_eng: e.target.value })} />
        </div>
      </> : (
        <div className="g g2">
          <div className="box"><b>{c.name}</b> <span className="mu">{c.id}</span><br />{c.phone}<br /><span className="mu">{[c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ')}</span></div>
          <div className="box"><b>{v.plate}</b> · {vehicleName(v)}<br /><span className="mu">Mileage {v.mileage != null ? km(v.mileage) : 'not recorded'} · made {dt(p.created)}</span></div>
        </div>
      )}

      {open ? <>
        <div className="row mt">
          <Field label="Estimation date" type="date" value={f.pdate} onChange={e => set({ pdate: e.target.value })} />
          <Field label="Estimator (from the staff list)"><select value={f.estimator_id} onChange={e => set({ estimator_id: e.target.value })}>
            {!f.estimator_id && <option value="">Choose…</option>}
            {db.staff.map(u => <option key={u.id} value={u.id}>{u.name} ({ROLES[u.role]})</option>)}
          </select></Field>
          <Field label="Insurance company"><select value={f.insurer_id} onChange={e => set({ insurer_id: e.target.value })}>
            <option value="">None: the customer pays</option>{db.ins.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></Field>
          <Field label="Policy no" value={f.policy_no} onChange={e => set({ policy_no: e.target.value })} />
        </div>
        <div className="mu small">
          {walkIn ? 'Choose the insurance company here if the customer is from insurance.' : c.insurer_id ? <>Customer profile insurance: {db.ins.find(x => x.id === c.insurer_id)?.name || 'not in the list'}{c.policy_no ? `, policy ${c.policy_no}` : ''}. <button type="button" className="lnk" onClick={() => set({ insurer_id: c.insurer_id, policy_no: c.policy_no || '' })}>Use it</button></> : 'The customer has no insurance in the profile.'}
        </div>
        <Field label="Damage / work description" value={f.note} onChange={e => set({ note: e.target.value })} />
        <div className="row">
          <Field label="Insurance claim no" value={f.claim_no} onChange={e => set({ claim_no: e.target.value })} />
          <Field label="Priority"><select value={f.priority} onChange={e => set({ priority: e.target.value })}><option value="">Normal</option><option>Urgent</option></select></Field>
          <Field label="Expected delivery date" type="date" value={f.due_date} onChange={e => set({ due_date: e.target.value })} />
        </div>
        <Field label="Terms and conditions (printed on the proforma)" value={f.terms} onChange={e => set({ terms: e.target.value })} placeholder="For example: valid for 15 days; parts availability may change the delivery date" />
      </> : (
        <div className="box mt">Estimation date <b>{p.pdate}</b> · Estimator <b>{p.estimator || 'not chosen'}</b> · Insurance <b>{db.ins.find(x => x.id === p.insurer_id)?.name || 'none (customer pays)'}</b>{p.policy_no ? ` · policy ${p.policy_no}` : ''}{p.claim_no ? ` · claim ${p.claim_no}` : ''}{p.priority ? ` · ${p.priority}` : ''}{p.due_date ? ` · delivery ${p.due_date}` : ''}{p.note ? <><br /><span className="mu">{p.note}</span></> : null}</div>
      )}

      <h3 className="mt">Labour</h3>
      {open ? <LabourLines labs={f.labours} setLabs={setLabs} tasks={db.lt} services={db.st} rate={rate} brand={v.brand} /> : <p className="mu">{p.labours.map(l => `${l.desc} (${money(l.price)})`).join(', ') || 'No labour.'}</p>}
      <h3 className="mt">Parts</h3>
      {open ? <PartLines parts={f.parts} setParts={setParts} stock={db.p} /> : <p className="mu">{p.parts.map(x => `${x.qty} x ${x.name} (${money(x.price)})`).join(', ') || 'No parts.'}</p>}

      <div className="box mt r">
        Labour {money(t.l)} · Parts {money(t.p)} · VAT {pct(t.rate)}% {money(t.vat)}
        <br /><b className="cn total">Proforma total {cur()} {money(t.total)}</b>
      </div>
      {open && <div className="mt"><SaveState state={state} restored={init.restored} /></div>}
      {isSA(me) && p.status !== 'Draft' && <ApprovalBox kind="proforma" id={p.id} />}

      {open && p.status === 'Issued' && (
        <div className="row mt">
          <Field label="Mileage now (km), for the job card" type="number" min="0" value={km2 !== '' ? km2 : knownKm} onChange={e => setKm(e.target.value)} />
          {walkIn && <><CustomerPicker label="Customer (empty = new customer from the details above)" value={ecid} onPick={pickCustomer} placeholder="New customer, or type a letter to find one" grow="2 1 260px" />
            {ecid && <Field label="Vehicle"><select value={evid} onChange={e => { setEvid(e.target.value); setKm(''); }}><option value="">New vehicle (plate above)</option>{db.v.filter(x => x.cid === ecid).map(x => <option key={x.id} value={x.id}>{x.plate} · {vehicleName(x)}</option>)}</select></Field>}</>}
          <Btn kind="gr" onClick={makeJob}>{walkIn ? (ecid ? 'Link customer and create job card' : 'Register customer and create job card') : 'Create job card from this proforma'}</Btn>
        </div>
      )}
      <div className="row mt">
        <Btn kind={p.status === 'Draft' ? 'ol' : ''} onClick={printIt}>Print proforma (A4)</Btn>
        <Btn kind="ol" onClick={pdfIt}>Download PDF</Btn>
        {open && <Btn onClick={save}>Save</Btn>}
        {open && p.status === 'Draft' && <Btn kind="gr" onClick={issue}>Finalize proforma</Btn>}
        {open && p.status === 'Draft' && isAdmin(me) && <Btn kind="ol" onClick={remove}>Delete draft</Btn>}
        {open && p.status === 'Issued' && isAdmin(me) && <Btn kind="ol" onClick={remove}>Delete finalized proforma</Btn>}
        {converted && p.job && <Btn kind="ol" onClick={() => openModal('job', { id: p.job })}>Open job card {p.job}</Btn>}
      </div>
      {open && p.status === 'Draft' && <p className="mu small">Finalize it when the estimator and the lines are final (or once the insurance company accepts the printed draft){linkedEst ? <>; estimate {id} is finalized with it</> : ''}. {linkedEst?.status === 'Draft' ? 'It also becomes finalized by itself when estimate ' + id + ' is finalized. ' : ''}Then pick the estimate when the job card is created, or add the customer and create the job card here. A finalized proforma can still be edited until the job card is created.</p>}
    </Dialog>
  );
}
