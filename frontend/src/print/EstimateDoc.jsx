import { dt, money, pct, tot, vehicleName } from '../lib/format.js';
import { SECTION_CODE } from '../lib/constants.js';
import { GARAGE, Letterhead } from './InvoiceDoc.jsx';

const area = c => [c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ');
const num = v => parseFloat(v) || 0;

/** A body & paint estimate on A4, draft or finalized: number, status, customer, vehicle, the labour and parts, totals.
 *  est: { id, status, note, created, finalized_at, by_name, used_in, labours, parts } */
export default function EstimateDoc({ est, customer: c = {}, vehicle: v = {}, garage = {}, vat = 0.15 }) {
  const g = { ...GARAGE, ...garage }, draft = est.status === 'Draft';
  const labours = est.labours.map(l => ({ ...l, price: num(l.price) })), parts = est.parts.map(p => ({ ...p, qty: num(p.qty), price: num(p.price) }));
  const t = tot({ labours, parts }, vat);
  let n = 0;
  return (
    <article className="doc a4">
      <Letterhead g={g}>
        <h1>ESTIMATE{draft ? ' (DRAFT)' : ''}</h1>
        <div>Estimate no <b>{est.id}</b></div><div>Made {dt(est.created)}</div>
        {!draft && est.finalized_at && <div>Finalized {dt(est.finalized_at)}{est.by_name ? ` by ${est.by_name}` : ''}</div>}
        {est.used_in && <div>Loaded on {est.used_in}</div>}
      </Letterhead>
      <section className="two">
        <div><h4>Customer</h4><b>{c.name || '-'}</b><div>{[c.id, c.phone].filter(Boolean).join(' · ')}</div>{c.tin && <div>TIN {c.tin}</div>}<div>{area(c)}</div></div>
        <div><h4>Vehicle</h4><b>{v.plate || '-'}</b> · {vehicleName(v)}<div>{[v.col, v.vin && `VIN ${v.vin}`, v.eng && `Engine ${v.eng}`].filter(Boolean).join(' · ')}</div>{v.mileage != null && <div>Mileage {Number(v.mileage).toLocaleString('en-US')} km</div>}</div>
      </section>
      {est.note && <section><h4>Damage / work</h4><div>{est.note}</div></section>}
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
      <p className="fine">{draft ? 'This is a DRAFT estimate and can still change. ' : ''}This is an estimate for approval, not a tax invoice. Amounts can change if the repair work changes.</p>
      <p className="sign">Prepared by: ______________________ &nbsp;&nbsp; Customer approval: ______________________ &nbsp;&nbsp; Date: ____________</p>
      <p className="motto">{g.motto}</p>
    </article>
  );
}
