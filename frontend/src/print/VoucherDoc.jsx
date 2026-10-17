import { dt, vehicleName } from '../lib/format.js';
import { GARAGE, Letterhead } from './InvoiceDoc.jsx';

// Vehicle delivery voucher (A4): what was done, the vehicle handed over, and signature lines for both sides.
// The job card must be Delivered; the hand-over time and the advisor's name come from its log.
export default function VoucherDoc({ job, customer: c = {}, vehicle: v = {}, garage = {} }) {
  const g = { ...GARAGE, ...garage }, done = [...(job.log || [])].reverse().find(x => x.s === 'Delivered');
  return (
    <article className="doc a4">
      <Letterhead g={g}><h1>VEHICLE DELIVERY VOUCHER</h1><div><b>{job.id}</b></div><div>{dt(done ? done.t : Date.now())}</div><div>Invoice {job.inv ? job.inv.no : '—'}</div></Letterhead>
      <section className="two">
        <div><h4>Customer</h4><b>{c.name}</b><div>{c.id} · {c.phone}</div></div>
        <div><h4>Vehicle</h4><b>{v.plate}</b> · {vehicleName(v)}<div>{[v.col, v.vin && `VIN ${v.vin}`, v.eng && `Engine ${v.eng}`].filter(Boolean).join(' · ')}</div></div>
      </section>
      <h4>Work carried out</h4>
      <table className="items">
        <thead><tr><th>#</th><th>Description</th><th>Section</th></tr></thead>
        <tbody>
          {job.labours.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td>{l.desc}</td><td>{l.section}</td></tr>)}
          {!job.labours.length && <tr><td colSpan="3">None.</td></tr>}
        </tbody>
      </table>
      {job.parts.length > 0 && <>
        <h4>Parts fitted</h4>
        <table className="items">
          <thead><tr><th>#</th><th>Part</th><th className="r">Qty</th></tr></thead>
          <tbody>{job.parts.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{p.code && <span className="code">{p.code} </span>}{p.name}</td><td className="r">{p.qty}</td></tr>)}</tbody>
        </table>
      </>}
      <p className="statement">The vehicle described above has been handed over to the customer or the customer's representative. The customer has checked the vehicle and received the work listed.</p>
      <section className="sigs">
        <div><div className="line" />Received by (name and signature)<div className="line" />ID or phone number<div className="line" />Date</div>
        <div><div className="line" />Service Advisor: {done ? done.by : ''}<div className="line" />Signature<div className="line" />Date</div>
      </section>
      <p className="motto">{g.motto}</p>
    </article>
  );
}
