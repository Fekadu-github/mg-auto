import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field } from './ui.jsx';
import CustomerPicker from './CustomerPicker.jsx';
import { discNote } from '../lib/format.js';

// Who referred a customer to the garage: a registered customer (his customer number is the referral code) or a person typed as name + phone.
// value = { cid, name, phone }; onChange(patch value)
export function ReferrerFields({ value, onChange, labels = {} }) {
  const set = p => onChange({ ...value, ...p });
  return (
    <div className="row">
      <CustomerPicker label={labels.pick || "Registered customer (customer number = referral code)"} value={value.cid || ''} onPick={id => set(id ? { cid: id, name: '', phone: '' } : { cid: '' })} grow={2} />
      <Field label={labels.name || "or name of the person"} value={value.name || ''} disabled={!!value.cid} onChange={e => set({ name: e.target.value })} />
      <Field label="Phone" value={value.phone || ''} disabled={!!value.cid} onChange={e => set({ phone: e.target.value })} />
    </div>
  );
}

// Referral discount for the customer who REFERRED somebody to the garage. It is on his estimate / proforma (EST-...) or job card (TC-...), typed by hand,
// states the person he referred (name, phone, customer number when registered), and comes off the subtotal before VAT.
export default function ReferralDiscount({ docId, disc, customerId, editable }) {
  const { db, run } = useApp();
  const cu = db.c.find(x => x.id === customerId);
  const from = d => ({ type: d?.type || 'pct', value: d ? String(d.value) : '', cid: d?.ref_cid || '', name: d?.ref_cid ? '' : d?.ref_name || '', phone: d?.ref_cid ? '' : d?.ref_phone || '' });
  const [open, setOpen] = useState(false), [f, setF] = useState(() => from(disc));
  if (!disc && !editable) return null;
  // customers who were referred by this customer (chosen as his referrer by number, or typed with his phone)
  const referred = cu ? db.c.filter(x => x.id !== cu.id && ((x.ref_cid && x.ref_cid === cu.id) || (cu.phone && x.ref_phone && x.ref_phone === cu.phone))) : [];
  const pickReferred = x => setF(s => ({ ...s, cid: x.id, name: '', phone: '' }));
  const begin = () => { setF(disc ? from(disc) : { ...from(null), ...(referred.length === 1 ? { cid: referred[0].id } : {}) }); setOpen(true); };
  const save = async () => {
    const value = parseFloat(f.value);
    if (!(value > 0)) return alert('Enter the discount: a percent or an amount above 0.');
    if (f.type === 'pct' && value > 100) return alert('A percent discount cannot be more than 100.');
    if (!f.cid && (!f.name.trim() || !f.phone.trim())) return alert("Say whom this customer referred: choose the registered customer, or type the person's name and phone.");
    const r = await run(() => api('/discounts/' + docId, 'PUT', { type: f.type, value, ref_cid: f.cid, ref_name: f.name, ref_phone: f.phone }));
    if (r.ok) setOpen(false);
  };
  const remove = async () => { if (confirm('Remove the referral discount?')) await run(() => api('/discounts/' + docId, 'DELETE')); };
  return (
    <div className="box mt">
      <div className="row" style={{ alignItems: 'center' }}>
        <b>Referral discount</b>
        <span className="mu small" style={{ flex: 1 }}>
          {disc ? discNote(disc) : referred.length ? `This customer referred: ${referred.map(x => `${x.name}, ${x.phone} (${x.id})`).join('; ')}. No discount entered yet.` : 'No discount. Enter one for a customer who referred somebody to the garage.'}
        </span>
        {editable && !open && <Btn kind="ol" onClick={begin}>{disc ? 'Change' : 'Enter discount'}</Btn>}
        {editable && !open && disc && <Btn kind="ol" onClick={remove}>Remove</Btn>}
      </div>
      {editable && open && (
        <>
          <div className="row mt">
            <Field label="Discount type"><select value={f.type} onChange={e => setF(s => ({ ...s, type: e.target.value }))}><option value="pct">Percent (%)</option><option value="amt">Amount</option></select></Field>
            <Field label={f.type === 'pct' ? 'Percent' : 'Amount'} type="number" min="0" step="any" value={f.value} onChange={e => setF(s => ({ ...s, value: e.target.value }))} />
          </div>
          <div className="mu small mt">Whom did this customer refer? The documents will say so.</div>
          {referred.length > 1 && <div className="row mt">{referred.map(x => <Btn key={x.id} kind="ol" onClick={() => pickReferred(x)}>{x.name} ({x.id})</Btn>)}</div>}
          <div className="mt"><ReferrerFields value={f} onChange={setF} labels={{ pick: 'Referred customer (registered)', name: 'or name of the person referred' }} /></div>
          <div className="row mt"><Btn onClick={save}>Save discount</Btn><Btn kind="ol" onClick={() => setOpen(false)}>Cancel</Btn></div>
        </>
      )}
    </div>
  );
}
