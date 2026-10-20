// The smaller dialogs: new job card, customer, vehicle, Telegram link, and the parts stock forms and history.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Table, useForm } from '../components/ui.jsx';
import { NOTIFY_OPTIONS } from '../lib/constants.js';
import { dt, km, vehicleName } from '../lib/format.js';
import { SECTION_CODE, SECTIONS, sectionOption } from '../lib/constants.js';
import { usePersistedForm } from '../lib/autosave.js';
import { suggestService } from '../lib/services.js';
import JobCardDialog from './JobCardDialog.jsx';
import EstimateDialog from './EstimateDialog.jsx';
import ProformaDialog from './ProformaDialog.jsx';
import { BulkPriceDialog, EditPartDialog, GrnDialog, ImportDialog } from './StockDialogs.jsx';

export const NotifySelect = ({ bind }) => (
  <Field label="Notify when vehicle is ready"><select {...bind('notify')}>{NOTIFY_OPTIONS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
);

export function NewJobDialog() {
  const { db, run, openModal, closeModal } = useApp();
  const [f, bind, set, reset] = usePersistedForm('form:new-job', { cid: db.c[0]?.id || '', vid: '', note: '', km: '' });
  const vehicles = db.v.filter(v => v.cid === f.cid), cur = vehicles.find(v => v.id === f.vid) || vehicles[0], vid = cur?.id || '';
  const kmShown = f.km !== '' ? f.km : cur?.mileage ?? '';                       // the vehicle's last mileage until the advisor types the reading
  const sug = kmShown !== '' ? suggestService(cur, +kmShown, db.st) : null;
  const create = async () => {
    if (!vid) return;
    if (kmShown === '') return alert('Enter the vehicle mileage (km).');
    const r = await run(() => api('/jobs', 'POST', { cid: f.cid, vid, note: f.note, mileage: parseFloat(kmShown) }));
    if (r.ok) { reset(); openModal('job', { id: r.data.id }); }
  };
  return (
    <Dialog title="New job card" onClose={closeModal} actions={<><Btn onClick={create} disabled={!vid}>Create job card</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <Field label="Customer"><select value={f.cid} onChange={e => set({ cid: e.target.value, vid: '', km: '' })}>{db.c.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></Field>
        <Field label="Vehicle"><select value={vid} onChange={e => set({ vid: e.target.value, km: '' })}>
          {vehicles.length ? vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {vehicleName(v)}</option>) : <option value="">No vehicle – add one in Customers</option>}
        </select></Field>
        <Field label="Mileage now (km)" type="number" min="0" value={kmShown} onChange={e => set({ km: e.target.value })} />
      </div>
      {cur && <div className="mu small">{cur.mileage != null ? `Last recorded: ${km(cur.mileage)}. ` : 'No mileage recorded yet. '}{sug ? `Service suggestion: ${sug.name} (due at ${km(sug.km)}).` : ''}</div>}
      <Field label="Customer complaint / notes" {...bind('note')} />
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
  const [f, bind] = useForm({ ...c, dob: c.dob || '', notify: c.notify || 'both', insurer_id: c.insurer_id || '', policy_no: c.policy_no || '', tin: c.tin || '' });
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

// Start a first-hand (insurance) proforma. The customer does NOT have to be registered: a walk-in is just written on the proforma,
// and is registered only when he returns, agrees, and the job card is created. It opens as a draft that saves itself.
export function NewProformaDialog() {
  const { db, run, openModal, closeModal } = useApp();
  const [f, , set] = usePersistedForm('form:new-proforma', { est: '', mode: 'est', cid: db.c[0]?.id || '', vid: '', guest_name: '', guest_phone: '', guest_plate: '', guest_brand: '', guest_model: '', insurer_id: '' });
  const byEst = f.mode === 'est', walk = f.mode === 'walkin';
  const cid = db.c.some(c => c.id === f.cid) ? f.cid : db.c[0]?.id || '';
  const vehicles = db.v.filter(v => v.cid === cid), vid = vehicles.some(v => v.id === f.vid) ? f.vid : vehicles[0]?.id || '';
  const ok = byEst ? !!f.est.trim() : walk ? true : !!vid;   // a walk-in needs nothing: the estimation number and the insurance company are enough to start
  const create = async () => {
    if (!ok) return;
    const body = byEst ? { est: f.est, insurer_id: f.insurer_id } : walk ? { guest_name: f.guest_name, guest_phone: f.guest_phone, guest_plate: f.guest_plate, guest_brand: f.guest_brand, guest_model: f.guest_model, insurer_id: f.insurer_id } : { cid, vid };
    const r = await run(() => api('/proformas', 'POST', body));
    if (r.ok) { set({ est: '', vid: '', guest_name: '', guest_phone: '', guest_plate: '', guest_brand: '', guest_model: '' }); openModal('proforma', { id: r.data.id }); }
  };
  return (
    <Dialog title="New proforma (estimation)" onClose={closeModal} actions={<><Btn onClick={create} disabled={!ok}>Create draft proforma</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <Btn kind={byEst ? '' : 'ol'} onClick={() => set({ mode: 'est' })}>From a draft estimate (EST no)</Btn>
        <Btn kind={walk ? '' : 'ol'} onClick={() => set({ mode: 'walkin' })}>Walk-in (not registered)</Btn>
        <Btn kind={f.mode === 'reg' ? '' : 'ol'} onClick={() => set({ mode: 'reg' })} disabled={!db.c.length}>Registered customer</Btn>
      </div>
      {byEst ? <>
        <div className="row mt">
          <Field label="Estimation number" placeholder="EST-0001" value={f.est} onChange={e => set({ est: e.target.value })} />
          <Field label="Insurance company"><select value={f.insurer_id} onChange={e => set({ insurer_id: e.target.value })}><option value="">Choose later</option>{db.ins.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        </div>
        <p className="mu small">Type the EST number of a draft estimate (Estimates page): its labour, parts and notes are brought here, then you print the proforma for the insurance company. When they accept, issue it, add the customer and create the job card.</p>
      </> : walk ? <>
        <div className="row mt">
          <Field label="Customer name" value={f.guest_name} onChange={e => set({ guest_name: e.target.value })} />
          <Field label="Phone" value={f.guest_phone} onChange={e => set({ guest_phone: e.target.value })} />
        </div>
        <div className="row">
          <Field label="Plate no" value={f.guest_plate} onChange={e => set({ guest_plate: e.target.value })} />
          <Field label="Brand" value={f.guest_brand} onChange={e => set({ guest_brand: e.target.value })} />
          <Field label="Model" value={f.guest_model} onChange={e => set({ guest_model: e.target.value })} />
        </div>
        <div className="row"><Field label="Insurance company"><select value={f.insurer_id} onChange={e => set({ insurer_id: e.target.value })}><option value="">Choose later</option>{db.ins.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
        <p className="mu small">All customer fields are optional. No registration needed. Make the estimation, print it and give it to the customer (for example to take to his insurance). When he comes back and agrees, you register him and create the job card from this same estimation.</p>
      </> : <>
        <div className="row mt">
          <Field label="Customer (profile and insurance are taken from it)"><select value={cid} onChange={e => set({ cid: e.target.value, vid: '' })}>{db.c.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></Field>
          <Field label="Vehicle"><select value={vid} onChange={e => set({ vid: e.target.value })}>
            {vehicles.length ? vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {vehicleName(v)}</option>) : <option value="">No vehicle – add one in Customers</option>}
          </select></Field>
        </div>
      </>}
    </Dialog>
  );
}

export function InsurerDialog({ id }) {
  const { db, run, closeModal } = useApp();
  const x = db.ins.find(i => i.id === id);
  const [f, bind] = useForm({ name: x?.name || '', phone: x?.phone || '' });
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
        <Field label="Total cost (ETB), empty = hours x rate" type="number" min="0" {...bind('price')} />
      </div>
    </Dialog>
  );
}

// Start an estimate for a customer's vehicle (Body & Paints). It opens as a draft.
export function NewEstimateDialog() {
  const { db, run, openModal, closeModal } = useApp();
  const [f, bind, set, reset] = usePersistedForm('form:new-estimate', { none: true, cid: db.c[0]?.id || '', vid: '', note: '' });
  const vehicles = db.v.filter(v => v.cid === f.cid), vid = vehicles.some(v => v.id === f.vid) ? f.vid : vehicles[0]?.id || '';
  const create = async () => {
    if (!f.none && !vid) return;
    const r = await run(() => api('/estimates', 'POST', f.none ? { note: f.note } : { cid: f.cid, vid, note: f.note }));
    if (r.ok) { reset(); openModal('estimate', { id: r.data.id }); }
  };
  return (
    <Dialog title="New estimate" onClose={closeModal} actions={<><Btn onClick={create} disabled={!f.none && !vid}>Create draft estimate</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <Btn kind={f.none ? '' : 'ol'} onClick={() => set({ none: true })}>No customer yet</Btn>
        <Btn kind={f.none ? 'ol' : ''} onClick={() => set({ none: false })} disabled={!db.c.length}>Registered customer</Btn>
      </div>
      {f.none ? <p className="mu small">Only the estimation number is made. Add the labour and parts, then call it by its EST number in Proformas to print it for the insurance. The customer is added when the job card is created.</p> : <div className="row mt">
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
    labours: lines((t?.labours || []).map(l => [l.desc, l.hours || '', l.price || ''])),
    parts: lines((t?.parts || []).map(p => [p.code || p.name, p.qty, p.price || '']))
  });
  if (!t) return <Dialog title="Service" onClose={closeModal}><p className="mu">This service no longer exists.</p></Dialog>;
  const save = async () => {
    const labours = cells(f.labours).map(([desc, hours, price]) => ({ desc, hours: parseFloat(hours) || 0, price: parseFloat(price) || 0 }));
    const parts = cells(f.parts).map(([a, qty, price]) => {
      const sp = db.p.find(x => x.code.toLowerCase() === a.toLowerCase());
      return { code: sp ? sp.code : '', name: sp ? sp.name : a, qty: parseFloat(qty) || 1, price: parseFloat(price) || 0 };
    });
    const r = await run(() => api('/service-types/' + code, 'PUT', { name: f.name, interval_km: parseFloat(f.interval_km), labours, parts }));
    if (r.ok) closeModal();
  };
  return (
    <Dialog title={`Edit ${t.name}`} onClose={closeModal} actions={<><Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt"><Field label="Name" grow="3 1 200px" {...bind('name')} /><Field label="Due every (km)" type="number" min="1" {...bind('interval_km')} /></div>
      <Field label="Labour (one per line: description | hours | price, price optional)"><textarea rows={6} {...bind('labours')} /></Field>
      <Field label="Parts (one per line: stock code or name | qty | price, price optional)"><textarea rows={5} {...bind('parts')} /></Field>
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
