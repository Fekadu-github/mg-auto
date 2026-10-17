import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Dialog, Field, Pill, SaveState } from '../components/ui.jsx';
import { LabourLines, PartLines } from '../components/Lines.jsx';
import { ROLES, isSA } from '../lib/constants.js';
import { restoreDraft, useAutosave } from '../lib/autosave.js';
import { dt, km, money, pct, tot, vehicleName } from '../lib/format.js';
import { usePrint } from '../print/PrintHost.jsx';
import ProformaDoc from '../print/ProformaDoc.jsx';

const r2 = n => Math.round(n * 100) / 100;
const num = v => parseFloat(v) || 0;

// The first-hand (insurance) proforma, made before any job card. Everything auto-saves as you type (and a copy stays on this device),
// so a power cut loses nothing and it can be edited later. Issue -> print -> create the job card: the proforma then becomes the job card's estimate.
export default function ProformaDialog({ id }) {
  const { db, me, run, say, refresh, openModal, closeModal, cust, veh } = useApp();
  const { print } = usePrint();
  const p = db.pr.find(x => x.id === id);
  const fromServer = p && { insurer_id: p.insurer_id || '', policy_no: p.policy_no || '', estimator_id: p.estimator_id || '', pdate: p.pdate, note: p.note || '', labours: p.labours, parts: p.parts };
  const open = !!p && p.status !== 'Converted' && isSA(me);
  const [init] = useState(() => restoreDraft('pro:' + id, fromServer));
  const [f, setF] = useState(() => (init.value ? { ...init.value, labours: init.value.labours.map(l => ({ ...l })), parts: init.value.parts.map(x => ({ ...x })) } : null));
  const [km2, setKm] = useState('');
  const { state, flush } = useAutosave('pro:' + id, f, { enabled: open && !!f, startDirty: init.restored, save: async v => { await api('/proformas/' + id, 'PUT', v); refresh().catch(() => {}); } });
  if (!p || !f) return <Dialog title="Proforma" onClose={closeModal}><p className="mu">This proforma no longer exists.</p></Dialog>;

  const c = cust(p.cid), v = veh(p.vid), rate = db.cfg.labourRate, vat = db.cfg.vat, converted = p.status === 'Converted';
  const insurer = db.ins.find(x => x.id === f.insurer_id), estimator = db.staff.find(x => x.id === f.estimator_id);
  const set = patch => setF(s => ({ ...s, ...patch }));
  const setLabs = fn => setF(s => ({ ...s, labours: fn(s.labours) })), setParts = fn => setF(s => ({ ...s, parts: fn(s.parts) }));
  const t = tot({ labours: f.labours.map(l => ({ price: num(l.price) })), parts: f.parts.map(x => ({ qty: num(x.qty), price: num(x.price) })) }, vat);
  const saved = async () => { if (await flush()) return true; say('The proforma is not saved yet. Wait a moment and try again.'); return false; };

  // What is printed: exactly what is on the screen (an empty labour cost counts hours x rate, as the server does when saving)
  const doc = () => ({
    ...p, ...f, estimator: estimator?.name || p.estimator, estimator_role: estimator?.role || p.estimator_role,
    labours: f.labours.filter(l => l.desc?.trim()).map(l => ({ ...l, price: num(l.price) || r2(num(l.hours) * rate) })), parts: f.parts.filter(x => x.name?.trim())
  });
  const printIt = async () => { if (open && !(await saved())) return; print(<ProformaDoc pro={doc()} customer={c} vehicle={v} insurer={insurer} garage={db.cfg.garage} vat={vat} roleName={r => ROLES[r] || r} />, 'a4'); };
  const issue = async () => { if (await saved()) await run(() => api(`/proformas/${id}/issue`, 'POST')); };
  const remove = async () => { if (!confirm(`Delete proforma ${id}?`)) return; const r = await run(() => api('/proformas/' + id, 'DELETE')); if (r.ok) closeModal(); };
  const makeJob = async () => {
    const mileage = km2 !== '' ? km2 : v.mileage ?? '';
    if (mileage === '') return say('Enter the vehicle mileage (km).');
    if (!confirm(`Create the job card from ${id}?\n\nIts labour and parts are loaded on the job card (stock parts leave stock now) and ${id} becomes the job card's estimate.`)) return;
    if (!(await saved())) return;
    const r = await run(() => api(`/proformas/${id}/convert`, 'POST', { mileage: parseFloat(mileage) }));
    if (r.ok) openModal('job', { id: r.data.job });
  };

  return (
    <Dialog title={<>{p.id} <Pill tone={p.status === 'Draft' ? 'a' : 'g'}>{p.status === 'Converted' ? `became ${p.job}` : p.status}</Pill></>} onClose={closeModal}>
      <div className="g g2">
        <div className="box"><b>{c.name}</b> <span className="mu">{c.id}</span><br />{c.phone}<br /><span className="mu">{[c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ')}</span></div>
        <div className="box"><b>{v.plate}</b> · {vehicleName(v)}<br /><span className="mu">Mileage {v.mileage != null ? km(v.mileage) : 'not recorded'} · made {dt(p.created)}</span></div>
      </div>

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
          {c.insurer_id ? <>Customer profile insurance: {db.ins.find(x => x.id === c.insurer_id)?.name || 'not in the list'}{c.policy_no ? `, policy ${c.policy_no}` : ''}. <button type="button" className="lnk" onClick={() => set({ insurer_id: c.insurer_id, policy_no: c.policy_no || '' })}>Use it</button></> : 'The customer has no insurance in the profile.'}
        </div>
        <Field label="Damage / work description" value={f.note} onChange={e => set({ note: e.target.value })} />
      </> : (
        <div className="box mt">Estimation date <b>{p.pdate}</b> · Estimator <b>{p.estimator || 'not chosen'}</b> · Insurance <b>{db.ins.find(x => x.id === p.insurer_id)?.name || 'none (customer pays)'}</b>{p.policy_no ? ` · policy ${p.policy_no}` : ''}{p.note ? <><br /><span className="mu">{p.note}</span></> : null}</div>
      )}

      <h3 className="mt">Labour</h3>
      {open ? <LabourLines labs={f.labours} setLabs={setLabs} tasks={db.lt} rate={rate} /> : <p className="mu">{p.labours.map(l => `${l.desc} (${money(l.price)})`).join(', ') || 'No labour.'}</p>}
      <h3 className="mt">Parts</h3>
      {open ? <PartLines parts={f.parts} setParts={setParts} stock={db.p} /> : <p className="mu">{p.parts.map(x => `${x.qty} x ${x.name} (${money(x.price)})`).join(', ') || 'No parts.'}</p>}

      <div className="box mt r">
        Labour {money(t.l)} · Parts {money(t.p)} · VAT {pct(t.rate)}% {money(t.vat)}
        <br /><b className="cn total">Proforma total ETB {money(t.total)}</b>
      </div>
      {open && <div className="mt"><SaveState state={state} restored={init.restored} /></div>}

      {open && p.status === 'Issued' && (
        <div className="row mt">
          <Field label="Mileage now (km), for the job card" type="number" min="0" value={km2 !== '' ? km2 : v.mileage ?? ''} onChange={e => setKm(e.target.value)} />
          <Btn kind="gr" onClick={makeJob}>Create job card from this proforma</Btn>
        </div>
      )}
      <div className="row mt">
        <Btn kind={p.status === 'Draft' ? 'ol' : ''} onClick={printIt}>Print proforma (A4)</Btn>
        {open && p.status === 'Draft' && <Btn kind="gr" onClick={issue}>Issue proforma</Btn>}
        {open && p.status === 'Draft' && <Btn kind="ol" onClick={remove}>Delete draft</Btn>}
        {converted && <Btn kind="ol" onClick={() => openModal('job', { id: p.job })}>Open job card {p.job}</Btn>}
      </div>
      {open && p.status === 'Draft' && <p className="mu small">Issue it when the estimator and the lines are final, print it for the insurance, then create the job card. An issued proforma can still be edited until the job card is created.</p>}
    </Dialog>
  );
}
