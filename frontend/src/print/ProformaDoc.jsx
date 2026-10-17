import { dt, money, pct, tot, vehicleName } from '../lib/format.js';
import { SECTION_CODE } from '../lib/constants.js';
import { GARAGE, Letterhead } from './InvoiceDoc.jsx';

const area = c => [c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ');
const num = v => parseFloat(v) || 0;

/** The first-hand (insurance) proforma on A4: estimation number, date, estimator, customer, vehicle, insurance, the labour and parts, totals.
 *  pro: { id, pdate, estimator, estimator_role, policy_no, note, status, labours, parts }; insurer: { name } or undefined (the customer pays). */
export default function ProformaDoc({ pro, customer: c = {}, vehicle: v = {}, insurer, garage = {}, vat = 0.15, roleName = r => r }) {
  const g = { ...GARAGE, ...garage };
  const labours = pro.labours.map(l => ({ ...l, price: num(l.price) })), parts = pro.parts.map(p => ({ ...p, qty: num(p.qty), price: num(p.price) }));
  const t = tot({ labours, parts }, vat);
  let n = 0;
  return (
    <article className="doc a4">
      <Letterhead g={g}>
        <h1>INSURANCE PROFORMA{pro.status === 'Draft' ? ' (DRAFT)' : ''}</h1>
        <div>Estimation no <b>{pro.id}</b></div><div>Date {pro.pdate}</div>
        <div>Estimator {pro.estimator}{pro.estimator_role ? ` (${roleName(pro.estimator_role)})` : ''}</div>
      </Letterhead>
      <section className="two">
        <div><h4>Customer</h4><b>{c.name}</b><div>{c.id} · {c.phone}</div>{c.tin && <div>TIN {c.tin}</div>}<div>{area(c)}</div></div>
        <div><h4>Vehicle</h4><b>{v.plate}</b> · {vehicleName(v)}<div>{[v.col, v.vin && `VIN ${v.vin}`, v.eng && `Engine ${v.eng}`].filter(Boolean).join(' · ')}</div></div>
      </section>
      <section className="two">
        <div><h4>Insurance</h4>{insurer ? <><b>{insurer.name}</b>{insurer.phone && <div>Tel {insurer.phone}</div>}<div>Policy no {pro.policy_no || '-'}</div></> : <b>No insurance: the customer pays</b>}</div>
        <div>{pro.note && <><h4>Damage / work</h4><div>{pro.note}</div></>}</div>
      </section>
      <table className="items">
        <thead><tr><th>#</th><th>Description</th><th>Type</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">Amount (ETB)</th></tr></thead>
        <tbody>
          {labours.map((l, i) => <tr key={'l' + i}><td>{++n}</td><td>{l.desc}</td><td>Labour {SECTION_CODE[l.section] || ''}{l.hours ? ` · ${l.hours} h` : ''}</td><td className="r">1</td><td className="r">{money(l.price)}</td><td className="r">{money(l.price)}</td></tr>)}
          {parts.map((p, i) => <tr key={'p' + i}><td>{++n}</td><td>{p.code && <span className="code">{p.code} </span>}{p.name}</td><td>Part</td><td className="r">{p.qty}</td><td className="r">{money(p.price)}</td><td className="r">{money(p.qty * p.price)}</td></tr>)}
          {!n && <tr><td colSpan="6">No items.</td></tr>}
        </tbody>
        <tfoot>
          <tr><td colSpan="5" className="r">Labour</td><td className="r">{money(t.l)}</td></tr>
          <tr><td colSpan="5" className="r">Parts</td><td className="r">{money(t.p)}</td></tr>
          <tr><td colSpan="5" className="r">Subtotal</td><td className="r">{money(t.sub)}</td></tr>
          <tr><td colSpan="5" className="r">VAT {pct(t.rate)}%</td><td className="r">{money(t.vat)}</td></tr>
          <tr className="grand"><td colSpan="5" className="r">Total (ETB)</td><td className="r">{money(t.total)}</td></tr>
        </tfoot>
      </table>
      <p className="fine">This is an estimate for approval, not a tax invoice. Amounts can change if the repair work changes.</p>
      <p className="sign">Estimator: ______________________ &nbsp;&nbsp; Insurance / customer approval: ______________________ &nbsp;&nbsp; Date: ____________</p>
      <p className="motto">{g.motto}</p>
    </article>
  );
}
