// The smaller dialogs: new job card, customer, vehicle, Telegram link, and the parts stock forms and history.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Table, useForm } from '../components/ui.jsx';
import { NOTIFY_OPTIONS } from '../lib/constants.js';
import { dt, vehicleName } from '../lib/format.js';
import JobCardDialog from './JobCardDialog.jsx';

export const NotifySelect = ({ bind }) => (
  <Field label="Notify when vehicle is ready"><select {...bind('notify')}>{NOTIFY_OPTIONS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
);

export function NewJobDialog() {
  const { db, run, openModal, closeModal } = useApp();
  const [f, bind, set] = useForm({ cid: db.c[0]?.id || '', vid: '', note: '' });
  const vehicles = db.v.filter(v => v.cid === f.cid), vid = vehicles.some(v => v.id === f.vid) ? f.vid : vehicles[0]?.id || '';
  const create = async () => {
    if (!vid) return;
    const r = await run(() => api('/jobs', 'POST', { cid: f.cid, vid, note: f.note }));
    if (r.ok) openModal('job', { id: r.data.id });
  };
  return (
    <Dialog title="New job card" onClose={closeModal} actions={<><Btn onClick={create} disabled={!vid}>Create job card</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">
        <Field label="Customer"><select value={f.cid} onChange={e => set({ cid: e.target.value, vid: '' })}>{db.c.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></Field>
        <Field label="Vehicle"><select value={vid} onChange={e => set({ vid: e.target.value })}>
          {vehicles.length ? vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {vehicleName(v)}</option>) : <option value="">No vehicle – add one in Customers</option>}
        </select></Field>
      </div>
      <Field label="Customer complaint / notes" {...bind('note')} />
    </Dialog>
  );
}

const CUSTOMER_FIELDS = [['name', 'Name'], ['phone', 'Phone'], ['city', 'City'], ['sub', 'Subcity'], ['woreda', 'Woreda'], ['house', 'House']];
export function CustomerDialog({ id }) {
  const { cust, run, closeModal } = useApp();
  const c = cust(id);
  const [f, bind] = useForm({ ...c, dob: c.dob || '', notify: c.notify || 'both' });
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
      </div>
    </Dialog>
  );
}

const VEHICLE_FIELDS = [['plate', 'Plate'], ['vin', 'VIN'], ['eng', 'Engine number'], ['col', 'Colour'], ['brand', 'Brand', 'e.g. Toyota'], ['model', 'Model', 'e.g. Rav4']];
// Add a vehicle (cid) or edit one (id)
export function VehicleDialog({ cid, id }) {
  const { cust, veh, run, closeModal } = useApp();
  const v = id ? veh(id) : {};
  const [f, bind] = useForm(Object.fromEntries(VEHICLE_FIELDS.map(([k]) => [k, v[k] || ''])));
  const save = async () => {
    if (!f.plate.trim()) return;
    const r = await run(() => (id ? api('/vehicles/' + id, 'PUT', f) : api(`/customers/${cid}/vehicles`, 'POST', f)));
    if (r.ok) closeModal();
  };
  return (
    <Dialog title={id ? `Edit vehicle ${v.plate}` : `Add vehicle for ${cust(cid).name}`} onClose={closeModal} actions={<><Btn onClick={save}>{id ? 'Save changes' : 'Save vehicle'}</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt">{VEHICLE_FIELDS.map(([k, l, ph]) => <Field key={k} label={l} placeholder={ph} {...bind(k)} />)}</div>
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

export function EditPartDialog({ id }) {
  const { run, closeModal } = useApp(), p = usePart(id), [f, bind] = useForm({ name: p.name || '', price: p.price ?? 0, reorder: p.reorder ?? 0 });
  const save = async () => { const r = await run(() => api('/inventory/' + id, 'PUT', { name: f.name, price: parseFloat(f.price) || 0, reorder: parseFloat(f.reorder) || 0 })); if (r.ok) closeModal(); };
  const retire = async () => { if (!confirm('Remove this part from the stock list? Its history is kept.')) return; const r = await run(() => api('/inventory/' + id, 'PUT', { active: false })); if (r.ok) closeModal(); };
  return (
    <Dialog title={`Edit ${p.code}`} onClose={closeModal} actions={<><Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={retire}>Retire part</Btn><Btn kind="ol" onClick={closeModal}>Cancel</Btn></>}>
      <div className="row mt"><Field label="Name" grow="3 1 200px" {...bind('name')} /><Field label="Unit price (before VAT)" type="number" min="0" {...bind('price')} /><Field label="Reorder level" type="number" min="0" {...bind('reorder')} /></div>
      <p className="mu">A price change applies to parts issued from now on; parts already on job cards keep their price.</p>
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
    case 'customer': return <CustomerDialog key={k} id={modal.id} />;
    case 'vehicle': return <VehicleDialog key={k} cid={modal.cid} id={modal.id} />;
    case 'telegram': return <TelegramDialog key={k} id={modal.id} />;
    case 'receive': return <ReceiveDialog key={k} id={modal.id} />;
    case 'count': return <CountDialog key={k} id={modal.id} />;
    case 'editPart': return <EditPartDialog key={k} id={modal.id} />;
    case 'history': return <HistoryDialog key={k} id={modal.id} />;
    default: return null;
  }
}
