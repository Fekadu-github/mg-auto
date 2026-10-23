import { TZ, birrInWords, dt, money, pct, splitCode, tot, cur } from '../lib/format.js';
import { DEFAULT_TERMS } from '../lib/constants.js';
import { GARAGE, Letterhead } from './InvoiceDoc.jsx';
import { BRAND_LOGOS } from '../lib/brands.js';

const num = v => parseFloat(v) || 0;
// 2026-10-09 -> 09/10/2026 (a plain date stays the same day on every PC); a timestamp is shown in Addis Ababa time
const dmy = d => (!d ? '' : /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : new Date(d).toLocaleDateString('en-GB', { timeZone: TZ }));
// The makes we serve (Toyota, BYD, Suzuki), as one row at the very top of the sheet. A logo file that is missing is simply left out.
const hide = e => { e.currentTarget.style.display = 'none'; };
const BrandStrip = () => <div className="est-brands">{BRAND_LOGOS.map(b => <img key={b.key} src={b.src} alt="" onError={hide} />)}</div>;
const F = ({ l, children }) => <div className="f"><span>{l}</span><b>{children}</b></div>;   // an empty value stays a blank line, so a walk-in sheet can be filled in by hand

/** The "Service Price Estimation" sheet (A4) used for the insurance proforma and for the body & paint estimate.
 *  Header with the garage and the estimation number, customer + insurance on the left, vehicle on the right, labour and other charges,
 *  totals with the amount in words, terms and the Prepared / Checked / Approved signature line. */
export default function EstimationSheet({ no, date, draft, walkIn, customer: c = {}, vehicle: v = {}, insurer, policyNo, claimNo, dueDate, note, labours, parts, vat = 0.15, terms, garage = {}, preparedBy, preparedRole, label = 'Estimation' }) {
  const g = { ...GARAGE, ...garage };
  const L = labours.map(l => ({ ...l, price: num(l.price) })), P = parts.map(p => ({ ...p, qty: num(p.qty), price: num(p.price) }));
  const t = tot({ labours: L, parts: P }, vat);
  const type = insurer ? 'Insurance' : walkIn ? 'Walk-in customer (private)' : 'Private';
  return (
    <article className={`doc a4 est${draft ? ' is-draft' : ''}`} data-density="normal">
      <div className="est-main">
      <BrandStrip />
      <Letterhead g={g}>
        <div className="est-meta"><span>Date</span><b>{dmy(date)}</b></div>
        <div className="est-meta"><span>Est. No</span><b>{no}</b></div>
        <div className="est-meta"><span>{label} type</span><b>{type}</b></div>
        {dueDate && <div className="est-meta"><span>Delivery time</span><b>{dmy(dueDate)}</b></div>}
      </Letterhead>
      <h2 className="est-title">Service Price Estimation{draft && <span className="est-chip">DRAFT</span>}</h2>

      <section className="est-grid">
        <div>
          <F l="Customer">{c.name}</F>
          <F l="Phone">{c.phone}</F>
          <F l="Address">{c.address}</F>
          {c.tin && <F l="TIN">{c.tin}</F>}
          {insurer ? <>
            <F l="Insurance">{insurer.name}</F>
            <F l="Ins. address">{insurer.address}</F>
            <F l="Ins. tel">{insurer.phone}</F>
            <F l="Policy no">{policyNo}</F>
            <F l="Claim no">{claimNo}</F>
          </> : <F l="Payment">Customer pays (no insurance)</F>}
        </div>
        <div>
          <F l="Plate no">{v.plate}</F>
          <F l="Make">{v.brand}</F>
          <F l="Model">{v.model}</F>
          <F l="Chassis no">{v.vin}</F>
          <F l="Engine no">{v.eng}</F>
          <F l="Colour">{v.col}</F>
          <F l="Mileage">{v.mileage != null && v.mileage !== '' ? `${Number(v.mileage).toLocaleString('en-US')} km` : ''}</F>
        </div>
      </section>

      <div className="est-wd"><b>Work description:</b> {note || '-'}</div>

      <table className="items est-items">
        <thead><tr><th className="code">Code</th><th>Description</th><th className="r qty">Qty</th><th className="r">Unit price</th><th className="r">Amount ({cur()})</th></tr></thead>
        <tbody>
          {!L.length && !P.length && <tr><td colSpan="5">No items.</td></tr>}
          {L.length > 0 && <>
            <tr className="grp"><td colSpan="5">LABOUR</td></tr>
            {L.map((l, i) => { const s = splitCode(l.desc); return <tr key={'l' + i}><td className="code">{s.code}</td><td>{s.text}</td><td className="r" /><td className="r" /><td className="r">{money(l.price)}</td></tr>; })}
            <tr className="sub"><td colSpan="4" className="r">Total for Labour</td><td className="r">{money(t.l)}</td></tr>
          </>}
          {P.length > 0 && <>
            <tr className="grp"><td colSpan="5">OTHER CHARGES (PARTS AND MATERIALS)</td></tr>
            {P.map((p, i) => <tr key={'p' + i}><td className="code">{p.code}</td><td>{p.name}</td><td className="r">{p.qty}</td><td className="r">{money(p.price)}</td><td className="r">{money(p.qty * p.price)}</td></tr>)}
            <tr className="sub"><td colSpan="4" className="r">Total for Other Charges</td><td className="r">{money(t.p)}</td></tr>
          </>}
        </tbody>
      </table>

      <table className="est-tot">
        <tbody>
          <tr><td>Total Est. Amount</td><td className="r">{money(t.sub)}</td></tr>
          <tr><td>{pct(t.rate)}% VAT</td><td className="r">{money(t.vat)}</td></tr>
          <tr className="grand"><td>Total Inc. VAT</td><td className="r">{money(t.total)}</td></tr>
        </tbody>
      </table>
      <p className="est-words">** {birrInWords(t.total)} ***</p>

      {terms && <div className="est-remark"><b>REMARK:</b> {terms}</div>}
      </div>

      {/* The terms, slogan, signatures and footer stay together as one block at the bottom of the LAST page (see print.css and PrintHost.jsx) */}
      <div className="est-tail">
      <div className="est-terms">
        <b className="u">Terms and Condition:</b>
        <ol>
          {DEFAULT_TERMS.map((x, i) => <li key={i}>{x}</li>)}
          {g.bank && <li>Bank account: {g.bank}</li>}
          {g.tin && <li>TIN: {g.tin}</li>}
        </ol>
      </div>
      <p className="est-slogan">{g.motto}</p>

      <div className="est-sigs">
        <div><div className="line">{preparedBy}</div><b>Prepared by</b>{preparedRole && <span>{preparedRole}</span>}</div>
        <div><div className="line" /><b>Checked by</b></div>
        <div><div className="line" /><b>Approved by</b></div>
      </div>
      <div className="est-foot"><span>{g.name}{g.phone ? ` · ${g.phone}` : ''}</span><span>Printed {dt(Date.now())}</span></div>
      </div>
    </article>
  );
}
