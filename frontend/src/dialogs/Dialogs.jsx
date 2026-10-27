// The smaller dialogs: new job card, customer, vehicle, Telegram link, and the parts stock forms and history.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Table, useForm } from '../components/ui.jsx';
import { NOTIFY_OPTIONS } from '../lib/constants.js';
import { dt, km, vehicleName, cur } from '../lib/format.js';
import { SECTION_CODE, SECTIONS, sectionOption } from '../lib/constants.js';
import { usePersistedForm } from '../lib/autosave.js';
import { suggestService } from '../lib/services.js';
import EstimatePicker, { EstimatePreview } from '../components/EstimatePicker.jsx';
import CustomerPicker from '../components/CustomerPicker.jsx';
import { ReferrerFields } from '../components/ReferralDiscount.jsx';
import { PartLines } from '../components/Lines.jsx';
import { shrink } from '../components/Inspection.jsx';
import JobCardDialog from './JobCardDialog.jsx';
import EstimateDialog from './EstimateDialog.jsx';
import ProformaDialog from './ProformaDialog.jsx';
import { BulkPriceDialog, EditPartDialog, GrnDialog, ImportDialog } from './StockDialogs.jsx';

export const NotifySelect = ({ bind }) => (
  <Field label="Notify when vehicle is ready"><select {...bind('notify')}>{NOTIFY_OPTIONS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
);

// The vehicle as it arrives: scratches, dents, broken parts, dashboard warning lights. At least one photo is needed before a job card can be created.
const PHOTO_LABELS = ['Front', 'Rear', 'Left side', 'Right side', 'Damage', 'Dashboard', 'Interior', 'Other'];
const base64Of = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => no(new Error('Cannot read this picture')); r.readAsDataURL(blob); });

export function NewJobDialog() {
  const { db, run, openModal, closeModal } = useApp();
  const [photos, setPhotos] = useState([]), [label, setLabel] = useState('Damage'), [busy, setBusy] = useState(false);   // { label, data (base64), url }
  const addPhotos = async e => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    setBusy(true);
    try {
      for (const file of files.slice(0, Math.max(0, 8 - photos.length))) { const blob = await shrink(file), data = await base64Of(blob), url = URL.createObjectURL(blob); setPhotos(ps => [...ps, { label, data, url }]); }
    } catch (x) { alert(x.message || 'This picture could not be read.'); }
    setBusy(false);
  };
  const dropPhoto = i => setPhotos(ps => { URL.revokeObjectURL(ps[i].url); return ps.filter((_, k) => k !== i); });
  const [f, bind, set, reset] = usePersistedForm('form:new-job', { cid: db.c[0]?.id || '', vid: '', note: '', km: '', est: '' });
  const [ref, setRef] = useState(null);   // the referrer typed or chosen here (null = leave what the customer already has)
  const cu = db.c.find(x => x.id === f.cid), savedRef = cu && (cu.ref_cid || cu.ref_name) ? cu : null;
  const referredBy = cu ? db.c.filter(x => x.id !== cu.id && ((x.ref_cid && x.ref_cid === cu.id) || (cu.phone && x.ref_phone && x.ref_phone === cu.phone))) : [];   // customers this one sent to the garage
  const vehicles = db.v.filter(v => v.cid === f.cid), cur = vehicles.find(v => v.id === f.vid) || vehicles[0], vid = cur?.id || '';
  const kmShown = f.km !== '' ? f.km : cur?.mileage ?? '';                       // the vehicle's last mileage until the advisor types the reading
  const sug = kmShown !== '' ? suggestService(cur, +kmShown, db.st) : null;
  // Finalized estimates still waiting for a job card: made for this vehicle, or made before any customer was registered
  const ready = db.e.filter(e => e.status === 'Finalized' && !e.used_in && (!e.vid || e.vid === vid));
  const typed = String(f.est || '').trim(), picked = ready.find(e => e.id.toUpperCase() === typed.toUpperCase());
  const create = async () => {
    if (!vid) return;
    if (kmShown === '') return alert('Enter the vehicle mileage (km).');
    if (typed && !picked) return alert(`${typed} is not a finalized estimate for this vehicle. Pick one from the list, or clear the box to create the job card without an estimate.`);
    if (ref && !ref.cid && (ref.name || '').trim() && !(ref.phone || '').trim()) return alert("Enter the referring person's phone number too.");
    if (!photos.length) return alert('Add at least one photo of the vehicle first (scratches, dents, broken parts, dashboard warning lights). A job card cannot be created without it.');
    const r = await run(() => api('/jobs', 'POST', { cid: f.cid, vid, note: f.note, mileage: parseFloat(kmShown), photos: photos.map(({ label: l, data }) => ({ label: l, data })), ...(picked ? { est: picked.id } : {}), ...(ref ? { ref_cid: ref.cid || '', ref_name: ref.name || '', ref_phone: ref.phone || '' } : {}) }));
    if (r.ok) { photos.forEach(p => URL.revokeObjectURL(p.url)); reset(); setRef(null); openModal('job', { id: r.data.id }); }
  };
  return (
    <Dialog title="New job card" onClose={closeModal} actions={<><Btn onClick={create} disabled={!vid || !photos.length || busy}>Create job card</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <CustomerPicker label="Customer" value={f.cid} onPick={id => { setRef(null); set({ cid: id, vid: '', km: '', est: '' }); }} />
        <Field label="Vehicle"><select value={vid} onChange={e => set({ vid: e.target.value, km: '', est: '' })}>
          {vehicles.length ? vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {vehicleName(v)}</option>) : <option value="">No vehicle – add one in Customers</option>}
        </select></Field>
        <Field label="Mileage now (km)" type="number" min="0" value={kmShown} onChange={e => set({ km: e.target.value })} />
      </div>
      {cur && <div className="mu small">{cur.mileage != null ? `Last recorded: ${km(cur.mileage)}. ` : 'No mileage recorded yet. '}{sug ? `Service suggestion: ${sug.name} (due at ${km(sug.km)}).` : ''}</div>}
      <Field label="Customer complaint / notes" {...bind('note')} />
      {referredBy.length > 0 && <div className="box mt"><b>This customer referred:</b> {referredBy.map(x => `${x.name}, ${x.phone} (${x.id})`).join('; ')}. Enter his referral discount on the job card or the estimate.</div>}
      <div className="box mt"><h3 style={{ marginTop: 0 }}>Referred by (optional)</h3>
        {savedRef && !ref
          ? <div className="row" style={{ alignItems: 'center' }}>
              <span>Referred by <b>{savedRef.ref_name}</b>{savedRef.ref_phone ? `, ${savedRef.ref_phone}` : ''}{savedRef.ref_cid ? ` (customer no. ${savedRef.ref_cid})` : ''}. </span>
              <Btn kind="ol" onClick={() => setRef({ cid: '', name: '', phone: '' })}>Change</Btn>
              <Btn kind="ol" onClick={() => setRef({ cid: '', name: '', phone: '' })}>Not referred</Btn>
            </div>
          : <>
              <div className="mu small">If somebody referred this customer to the garage, say who: choose a registered customer (his customer number is the referral code) or type the name and phone. It is saved on the customer. The referrer gets his discount when he comes himself: it is entered on his own job card or estimate.</div>
              <div className="mt"><ReferrerFields value={ref || { cid: '', name: '', phone: '' }} onChange={setRef} /></div>
            </>}
      </div>
      <div className="box mt"><h3 style={{ marginTop: 0 }}>Photos of the vehicle (required)</h3>
        <div className="mu small">Take or choose photos of the vehicle as it arrives: scratches, dents, broken parts, dashboard warning lights. A job card cannot be created, and work cannot start, without at least one photo.</div>
        <div className="row mt"><Field label="Photo of"><select value={label} onChange={e => setLabel(e.target.value)}>{PHOTO_LABELS.map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
          <label className="b ol" style={{ cursor: photos.length >= 8 ? 'not-allowed' : 'pointer' }}>{busy ? 'Adding…' : 'Add photos'}<input type="file" accept="image/*" multiple hidden disabled={busy || photos.length >= 8} onChange={addPhotos} /></label>
          <span className="mu small">{photos.length} of 8 added</span></div>
        {!!photos.length && <div className="row mt" style={{ gap: 10 }}>{photos.map((p, i) => (
          <figure key={p.url} style={{ margin: 0, width: 110 }}><img src={p.url} alt={p.label} style={{ width: 110, height: 82, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
            <figcaption className="mu small">{p.label} · <button type="button" className="lnk" onClick={() => dropPhoto(i)}>Remove</button></figcaption></figure>))}</div>}
      </div>
      <div className="mt">
        <EstimatePicker label="Finalized estimate (optional)" estimates={ready} value={f.est || ''} onChange={x => set({ est: x })} onPick={e => set({ est: e.id })} />
        <div className="mu small">Type a letter or number and the finalized estimates appear. Pick one and its labour and parts are listed here and added to the new job card automatically. Leave it empty to add labour and parts by hand.</div>
      </div>
      {picked && <><EstimatePreview est={picked} /><div className="mu small">Parts from stock leave stock when the job card is created; a part that is short waits for stock.</div></>}
    </Dialog>
  );
}

// The customer's insurance company (from the registered list) and policy number: a new proforma starts from them
export const InsuranceFields = ({ db, bind }) => (
  <>
    <Field label="Insurance company"><select {...bind('insurer_id')}><option value="">None: the customer pays</option>{db.ins.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
    <Field label="Policy no" {...bind('policy_no')} />
  </>
);

const CUSTOMER_FIELDS = [['name', 'Name'], ['phone', 'Phone'], ['city', 'City'], ['sub', 'Subcity'], ['woreda', 'Woreda'], ['house', 'House'], ['tin', 'TIN']];
export function CustomerDialog({ id }) {
  const { db, cust, run, closeModal } = useApp();
  const c = cust(id);
  const [f, bind, set] = useForm({ ...c, ref_cid: c.ref_cid || '', ref_name: c.ref_name || '', ref_phone: c.ref_phone || '', dob: c.dob || '', notify: c.notify || 'both', insurer_id: c.insurer_id || '', policy_no: c.policy_no || '', tin: c.tin || '' });
  const save = async () => {
    if (!f.name?.trim() || !f.phone?.trim()) return;
    const r = await run(() => api('/customers/' + id, 'PUT', { ...f, dob: f.dob || null }));
    if (r.ok) closeModal();
  };
  return (
    <Dialog title={`Edit ${c.name}`} onClose={closeModal} actions={<><Btn onClick={save}>Save changes</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        {CUSTOMER_FIELDS.map(([k, l]) => <Field key={k} label={l} {...bind(k)} />)}
        <Field label="Date of birth" type="date" {...bind('dob')} />
        <NotifySelect bind={bind} />
        <InsuranceFields db={db} bind={bind} />
      </div>
      <div className="box mt"><h3 style={{ marginTop: 0 }}>Referred by</h3>
        <ReferrerFields value={{ cid: f.ref_cid || '', name: f.ref_name || '', phone: f.ref_phone || '' }} onChange={v => set({ ref_cid: v.cid || '', ref_name: v.name || '', ref_phone: v.phone || '' })} />
      </div>
    </Dialog>
  );
}

const VEHICLE_FIELDS = [['plate', 'Plate'], ['vin', 'VIN'], ['eng', 'Engine number'], ['col', 'Colour'], ['brand', 'Brand', 'e.g. Toyota'], ['model', 'Model', 'e.g. Rav4']];
// Add a vehicle (cid) or edit one (id)
export function VehicleDialog({ cid, id }) {
  const { db, cust, veh, run, closeModal } = useApp();
  const v = id ? veh(id) : {};
  const [f, bind, , reset] = usePersistedForm(id ? null : `form:new-vehicle:${cid}`, { ...Object.fromEntries(VEHICLE_FIELDS.map(([k]) => [k, v[k] || ''])), mileage: v.mileage ?? '' });   // a new vehicle is kept until saved; editing one is not
  const next = v.next_km ? db.st.find(t => t.code === v.next_type) : null;
  const save = async () => {
    if (!f.plate.trim()) return;
    if (!id && f.mileage === '') return alert('Enter the current mileage (km): it is registered with the vehicle.');
    const r = await run(() => (id ? api('/vehicles/' + id, 'PUT', f) : api(`/customers/${cid}/vehicles`, 'POST', f)));
    if (r.ok) { reset(); closeModal(); }
  };
  return (
    <Dialog title={id ? `Edit vehicle ${v.plate}` : `Add vehicle for ${cust(cid).name}`} onClose={closeModal} actions={<><Btn onClick={save}>{id ? 'Save changes' : 'Save vehicle'}</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">{VEHICLE_FIELDS.map(([k, l, ph]) => <Field key={k} label={l} placeholder={ph} {...bind(k)} />)}
        <Field label={id ? 'Mileage (km)' : 'Mileage now (km), required'} type="number" min="0" {...bind('mileage')} /></div>
      {next && <p className="mu small">Next service planned: {next.name} at {km(v.next_km)} (set when the last service was completed).</p>}
      {id && <p className="mu small">The mileage moves forward by itself each time a job card is closed. Change it here only to correct a mistake.</p>}
    </Dialog>
  );
}

export function TelegramDialog({ id }) {
  const { cust, say, closeModal } = useApp();
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;   // only the latest link is shown (each request makes a new one-time token)
    api(`/customers/${id}/telegram-link`, 'POST').then(d => live && setUrl(d.url)).catch(e => { if (live) { say(e.message); closeModal(); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const copy = () => navigator.clipboard?.writeText(url).then(() => say('Copied'), () => say('Copy failed: select the link and copy it by hand.'));
  return (
    <Dialog title={`Telegram link for ${cust(id).name}`} onClose={closeModal} actions={<><Btn onClick={copy} disabled={!url}>Copy link</Btn><Btn kind="ol" onClick={closeModal}>Close</Btn></>}>
      <p className="mt">Send this link to the customer, or open it on their phone. When they tap <b>Start</b> in Telegram they are linked and will get a message when the vehicle is ready. The link works once.</p>
      <div className="box mt" style={{ wordBreak: 'break-all' }}>{url || 'Making the link…'}</div>
    </Dialog>
  );
}

// Start a proforma. A proforma never gets a number of its own: it is made from an estimation (draft or finalized) and takes its EST number.
// Type a letter or number, click the estimate, and its labour, parts and notes are brought into the proforma, which opens ready to edit and print.
export function NewProformaDialog() {
  const { db, run, openModal, closeModal } = useApp();
  const [f, , set] = usePersistedForm('form:new-proforma', { est: '', insurer_id: '' });
  // Estimates that can still become a proforma: not on a job card and without a proforma yet (draft or finalized)
  const open = db.e.filter(e => !e.used_in && !db.pr.some(p => p.id === e.id)), typed = String(f.est || '').trim(), picked = open.find(e => e.id.toUpperCase() === typed.toUpperCase());
  const create = async () => {
    if (!picked) return;
    const r = await run(() => api('/proformas', 'POST', { est: picked.id, insurer_id: f.insurer_id }));
    if (r.ok) { set({ est: '' }); openModal('proforma', { id: r.data.id }); }
  };
  return (
    <Dialog title="New proforma (from an estimate)" onClose={closeModal} actions={<><Btn onClick={create} disabled={!picked}>Create proforma</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <EstimatePicker label="Estimation number" grow="2 1 260px" estimates={open} value={f.est || ''} onChange={x => set({ est: x })} onPick={e => set({ est: e.id })} />
        <Field label="Insurance company"><select value={f.insurer_id} onChange={e => set({ insurer_id: e.target.value })}><option value="">Choose later</option>{db.ins.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      </div>
      {picked && <EstimatePreview est={picked} />}
      <p className="mu small">EST numbers are given by estimations only, so make the estimate first (Estimates page). Type a letter or number and the estimates appear (name, plate and damage note work too). Click one: its labour, parts and notes are brought into the proforma. A finalized estimate gives a finalized proforma; a draft estimate gives a draft proforma that is finalized together with it. {!open.length && 'No estimate is waiting for a proforma yet.'}</p>
    </Dialog>
  );
}

export function InsurerDialog({ id }) {
  const { db, run, closeModal } = useApp();
  const x = db.ins.find(i => i.id === id);
  const [f, bind] = useForm({ name: x?.name || '', phone: x?.phone || '', address: x?.address || '' });
  const save = async () => {
    if (!f.name.trim()) return;
    const r = await run(() => api('/insurers/' + id, 'PUT', f));
    if (r.ok) closeModal();
  };
  const retire = async () => {
    if (!confirm(`Remove ${x.name} from the list? Existing customers and proformas keep their record.`)) return;
    const r = await run(() => api('/insurers/' + id, 'PUT', { ...f, active: false }));
    if (r.ok) closeModal();
  };
  return (
    <Dialog title={`Edit ${x?.name || 'insurance company'}`} onClose={closeModal} actions={<><Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={retire}>Remove from list</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt"><Field label="Company name" grow="3 1 200px" {...bind('name')} /><Field label="Phone" {...bind('phone')} /></div>
      <div className="row"><Field label="Address (printed on proformas)" grow="3 1 200px" {...bind('address')} /></div>
    </Dialog>
  );
}

export function LabourTaskDialog({ id }) {
  const { db, run, closeModal } = useApp();
  const t = db.lt.find(x => x.id === id);
  const [f, bind] = useForm({ code: t?.code || '', model_grp: t?.model_grp || '', task: t?.task || '', name: t?.name || '', section: t?.section || SECTIONS[1], hours: t?.hours || '', price: t?.price || '' });
  const body = extra => ({ code: f.code, model_grp: f.model_grp, task: f.task, name: f.name, section: f.section, hours: parseFloat(f.hours) || 0, price: parseFloat(f.price) || 0, ...extra });
  const save = async () => { if (!f.name.trim()) return; const r = await run(() => api('/labour-tasks/' + id, 'PUT', body())); if (r.ok) closeModal(); };
  const retire = async () => { if (!confirm(`Remove "${t.name}" from the list?`)) return; const r = await run(() => api('/labour-tasks/' + id, 'PUT', body({ active: false }))); if (r.ok) closeModal(); };
  return (
    <Dialog title={`Edit ${t?.name || 'task'}`} onClose={closeModal} actions={<><Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={retire}>Remove from list</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <Field label="Labour code" {...bind('code')} />
        <Field label="Model group" {...bind('model_grp')} />
        <Field label="Task (group, empty = single line)" grow="2 1 180px" {...bind('task')} />
        <Field label="Labour line" grow="3 1 200px" {...bind('name')} />
        <Field label="Section"><select {...bind('section')}>{SECTIONS.map(s => <option key={s} value={s}>{sectionOption(s)}</option>)}</select></Field>
        <Field label="Hours" type="number" min="0" step="0.25" {...bind('hours')} />
        <Field label={`Total cost (${cur()}), empty = hours x rate`} type="number" min="0" {...bind('price')} />
      </div>
    </Dialog>
  );
}

// Start an estimate for a customer's vehicle (Body & Paints). It opens as a draft.
export function NewEstimateDialog() {
  const { db, run, openModal, closeModal } = useApp();
  const [f, bind, set, reset] = usePersistedForm('form:new-estimate', { none: true, cid: db.c[0]?.id || '', vid: '', note: '', guest_name: '', guest_phone: '', guest_plate: '', guest_brand: '', guest_model: '', guest_vin: '', guest_eng: '' });
  const vehicles = db.v.filter(v => v.cid === f.cid), vid = vehicles.some(v => v.id === f.vid) ? f.vid : vehicles[0]?.id || '';
  const create = async () => {
    if (!f.none && !vid) return;
    const r = await run(() => api('/estimates', 'POST', f.none ? { note: f.note, guest_name: f.guest_name, guest_phone: f.guest_phone, guest_plate: f.guest_plate, guest_brand: f.guest_brand, guest_model: f.guest_model, guest_vin: f.guest_vin, guest_eng: f.guest_eng } : { cid: f.cid, vid, note: f.note }));
    if (r.ok) { reset(); openModal('estimate', { id: r.data.id }); }
  };
  return (
    <Dialog title="New estimate" onClose={closeModal} actions={<><Btn onClick={create} disabled={!f.none && !vid}>Create draft estimate</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <Btn kind={f.none ? '' : 'ol'} onClick={() => set({ none: true })}>No customer yet</Btn>
        <Btn kind={f.none ? 'ol' : ''} onClick={() => set({ none: false })} disabled={!db.c.length}>Registered customer</Btn>
      </div>
      {f.none ? <><p className="mu small">Optional: register the customer and the vehicle as on the proforma (you can leave them empty and create the estimate now). If filled, they are printed on the estimate, and the customer is added to Customers when the job card is created.</p>
        <div className="row mt">
          <Field label="Customer name" {...bind('guest_name')} />
          <Field label="Phone" {...bind('guest_phone')} />
          <Field label="Plate no" {...bind('guest_plate')} />
        </div>
        <div className="row">
          <Field label="Brand" {...bind('guest_brand')} />
          <Field label="Model" {...bind('guest_model')} />
          <Field label="Chassis / VIN no" {...bind('guest_vin')} />
          <Field label="Engine / motor no" {...bind('guest_eng')} />
        </div></> : <div className="row mt">
        <Field label="Customer"><select value={f.cid} onChange={e => set({ cid: e.target.value, vid: '' })}>{db.c.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></Field>
        <Field label="Vehicle"><select value={vid} onChange={e => set({ vid: e.target.value })}>
          {vehicles.length ? vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {vehicleName(v)}</option>) : <option value="">No vehicle – add one in Customers</option>}
        </select></Field>
      </div>}
      <Field label="Damage / work description" {...bind('note')} />
    </Dialog>
  );
}

// Edit a service package. One line per labour: description | hours | price (price optional, hours x labour rate when empty).
// One line per part: stock code or name | qty | price (price optional, the stock price when the code is in the stock list).
const lines = rows => rows.map(r => r.join(' | ').replace(/( \| )+$/, '')).join('\n');
const cells = text => text.split('\n').map(l => l.split('|').map(x => x.trim())).filter(c => c[0]);
export function ServiceTypeDialog({ code }) {
  const { db, run, closeModal } = useApp();
  const t = db.st.find(x => x.code === code);
  const [f, bind] = useForm({
    name: t?.name || '', interval_km: t?.interval_km || '',
    labours: lines((t?.labours || []).map(l => [l.desc, l.hours || '', l.price || '']))
  });
  // parts: type a letter and pick from stock, or type any text to add a part that is not in stock
  const [parts, setParts] = useState(() => (t?.parts || []).map(p => { const sp = p.code && db.p.find(x => x.code.toLowerCase() === p.code.toLowerCase()); return { name: sp ? sp.name : p.name, code: sp ? sp.code : '', pid: sp ? sp.id : undefined, qty: p.qty, price: p.price || (sp ? sp.price : '') }; }));
  if (!t) return <Dialog title="Service" onClose={closeModal}><p className="mu">This service no longer exists.</p></Dialog>;
  const save = async () => {
    const labours = cells(f.labours).map(([desc, hours, price]) => ({ desc, hours: parseFloat(hours) || 0, price: parseFloat(price) || 0 }));
    const partRows = parts.filter(x => (x.name || '').trim()).map(x => {
      const sp = x.pid && db.p.find(y => y.id === x.pid), price = parseFloat(x.price) || 0;
      return { code: sp ? sp.code : '', name: sp ? sp.name : x.name.trim(), qty: parseFloat(x.qty) || 1, price: sp && price === sp.price ? 0 : price };   // unchanged stock price stays 0: the live stock price is used
    });
    const r = await run(() => api('/service-types/' + code, 'PUT', { name: f.name, interval_km: parseFloat(f.interval_km), labours, parts: partRows }));
    if (r.ok) closeModal();
  };
  return (
    <Dialog title={`Edit ${t.name}`} onClose={closeModal} actions={<><Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt"><Field label="Name" grow="3 1 200px" {...bind('name')} /><Field label="Due every (km)" type="number" min="1" {...bind('interval_km')} /></div>
      <Field label="Labour (one per line: description | hours | price, price optional)"><textarea rows={6} {...bind('labours')} /></Field>
      <div className="mt"><b>Parts</b><PartLines parts={parts} setParts={setParts} stock={db.p} /></div>
      <p className="mu small">When this service is added to a job card, its labour is priced from the hours and each part whose code is in the stock list is issued from stock. The Service Advisor can change any price on the card.</p>
    </Dialog>
  );
}

// ---- parts stock ----
const usePart = id => { const { db } = useApp(); return db.p.find(x => x.id === id) || {}; };

export function ReceiveDialog({ id }) {
  const { run, closeModal } = useApp(), p = usePart(id), [f, bind] = useForm({ qty: '', note: '' });
  const save = async () => { const r = await run(() => api(`/inventory/${id}/receive`, 'POST', { qty: parseFloat(f.qty), note: f.note })); if (r.ok) closeModal(); };
  return (
    <Dialog title={`Receive stock · ${p.code} ${p.name}`} onClose={closeModal} actions={<><Btn onClick={save}>Add to stock</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <p className="mu">Now in stock: {p.stock}</p>
      <div className="row mt"><Field label="Quantity received" type="number" min="0.01" step="any" {...bind('qty')} /><Field label="Note (supplier, invoice no.)" grow="3 1 200px" {...bind('note')} /></div>
    </Dialog>
  );
}

export function CountDialog({ id }) {
  const { run, closeModal } = useApp(), p = usePart(id), [f, bind] = useForm({ count: '', note: '' });
  const save = async () => { const r = await run(() => api(`/inventory/${id}/adjust`, 'POST', { count: parseFloat(f.count), note: f.note })); if (r.ok) closeModal(); };
  return (
    <Dialog title={`Stock count · ${p.code} ${p.name}`} onClose={closeModal} actions={<><Btn onClick={save}>Set stock to counted quantity</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <p className="mu">The system says: {p.stock}</p>
      <div className="row mt"><Field label="Counted quantity" type="number" min="0" step="any" {...bind('count')} /><Field label="Reason (required)" grow="3 1 200px" placeholder="e.g. monthly count, damaged" {...bind('note')} /></div>
    </Dialog>
  );
}

export function HistoryDialog({ id }) {
  const { say, closeModal } = useApp(), p = usePart(id), [rows, setRows] = useState(null);
  useEffect(() => { api(`/inventory/${id}/moves`).then(setRows).catch(e => say(e.message)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  return (
    <Dialog title={`${p.code} ${p.name} · history`} onClose={closeModal}>
      <Table head={['When', 'What', { t: 'Change', r: 1 }, { t: 'Balance', r: 1 }, 'Job card', 'By', 'Note']} empty={rows && !rows.length && 'No movements yet.'}>
        {(rows || []).map(x => <tr key={x.id}><td>{dt(x.at)}</td><td>{x.reason}</td><td className="r">{x.delta > 0 ? '+' : ''}{x.delta}</td><td className="r">{x.balance}</td><td>{x.job || ''}</td><td>{x.by_name || ''}</td><td>{x.note || ''}</td></tr>)}
      </Table>
    </Dialog>
  );
}

// One place that decides which dialog is open
export function ModalRoot() {
  const { modal } = useApp();
  if (!modal) return null;
  const k = JSON.stringify(modal);   // a different dialog (or record) is a fresh component with fresh form state
  switch (modal.type) {
    case 'job': return <JobCardDialog key={k} id={modal.id} />;
    case 'newJob': return <NewJobDialog key={k} />;
    case 'proforma': return <ProformaDialog key={k} id={modal.id} />;
    case 'newProforma': return <NewProformaDialog key={k} />;
    case 'insurer': return <InsurerDialog key={k} id={modal.id} />;
    case 'labourTask': return <LabourTaskDialog key={k} id={modal.id} />;
    case 'estimate': return <EstimateDialog key={k} id={modal.id} jid={modal.jid} />;
    case 'newEstimate': return <NewEstimateDialog key={k} />;
    case 'service': return <ServiceTypeDialog key={k} code={modal.code} />;
    case 'customer': return <CustomerDialog key={k} id={modal.id} />;
    case 'vehicle': return <VehicleDialog key={k} cid={modal.cid} id={modal.id} />;
    case 'telegram': return <TelegramDialog key={k} id={modal.id} />;
    case 'receive': return <ReceiveDialog key={k} id={modal.id} />;
    case 'count': return <CountDialog key={k} id={modal.id} />;
    case 'editPart': return <EditPartDialog key={k} id={modal.id} />;
    case 'history': return <HistoryDialog key={k} id={modal.id} />;
    case 'grn': return <GrnDialog key={k} pid={modal.pid} />;
    case 'importItems': return <ImportDialog key={k} />;
    case 'bulkPrice': return <BulkPriceDialog key={k} />;
    default: return null;
  }
}
