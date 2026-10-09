import { dt, invoiceLines, money, pct, snap, vehicleName } from '../lib/format.js';

export const GARAGE = { name: 'MADEG — MG Auto', address: 'Gurdshola, around Top Ten Hotel, Addis Ababa', phone: '0980766566', tin: '', motto: 'Your car, our care' };

// Proforma = quotation on A4. Cash and Credit invoices = 80 mm point-of-sale receipt.
export const invoiceSize = doc => (doc.type === 'Proforma' ? 'a4' : 'pos');

const area = c => [c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ');

export function Letterhead({ g, children }) {
  return (
    <div className="lh">
      <img src="/madeg-logo.png" alt="" className="lh-logo" />
      <div className="lh-co"><b>{g.name}</b><div>{g.address}</div><div>Tel {g.phone}{g.tin ? ` · TIN ${g.tin}` : ''}</div></div>
      <div className="lh-doc">{children}</div>
    </div>
  );
}

/** job, customer, vehicle: records from the app data. doc: the invoice or proforma ({ type, no, date, totals }). */
export default function InvoiceDoc({ job, customer: c = {}, vehicle: v = {}, doc, garage = {}, vat = 0.15 }) {
  const g = { ...GARAGE, ...garage }, t = snap(job, doc, vat), lines = invoiceLines(job), credit = doc.type === 'Credit';
  return doc.type === 'Proforma' ? (
    <article className="doc a4">
      <Letterhead g={g}><h1>PROFORMA INVOICE</h1><div><b>{doc.no}</b></div><div>{dt(doc.date)}</div><div>Job card {job.id}</div></Letterhead>
      <section className="two">
        <div><h4>Customer</h4><b>{c.name}</b><div>{c.id} · {c.phone}</div><div>{area(c)}</div></div>
        <div><h4>Vehicle</h4><b>{v.plate}</b> · {vehicleName(v)}<div>{[v.col, v.vin && `VIN ${v.vin}`, v.eng && `Engine ${v.eng}`].filter(Boolean).join(' · ')}</div></div>
      </section>
      <table className="items">
        <thead><tr><th>#</th><th>Description</th><th>Type</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">Amount (ETB)</th></tr></thead>
        <tbody>
          {lines.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{l.code && <span className="code">{l.code} </span>}{l.desc}</td><td>{l.kind}</td><td className="r">{l.qty}</td><td className="r">{money(l.unit)}</td><td className="r">{money(l.amount)}</td></tr>)}
          {!lines.length && <tr><td colSpan="6">No items.</td></tr>}
        </tbody>
        <tfoot>
          <tr><td colSpan="5" className="r">Labour</td><td className="r">{money(t.l)}</td></tr>
          <tr><td colSpan="5" className="r">Parts</td><td className="r">{money(t.p)}</td></tr>
          <tr><td colSpan="5" className="r">Subtotal</td><td className="r">{money(t.sub)}</td></tr>
          <tr><td colSpan="5" className="r">VAT {pct(t.rate)}%</td><td className="r">{money(t.vat)}</td></tr>
          <tr className="grand"><td colSpan="5" className="r">Total (ETB)</td><td className="r">{money(t.total)}</td></tr>
        </tfoot>
      </table>
      <p className="fine">This is a quotation, not a tax invoice. Amounts can change if the work changes.</p>
      <p className="motto">{g.motto}</p>
    </article>
  ) : (
    <article className="doc pos">
      <div className="c"><b className="big">{g.name}</b><div>{g.address}</div><div>Tel {g.phone}</div>{g.tin && <div>TIN {g.tin}</div>}</div>
      <hr />
      <div className="c"><b>{doc.type.toUpperCase()} INVOICE</b></div>
      <div className="kv"><span>No</span><span>{doc.no}</span></div>
      <div className="kv"><span>Date</span><span>{dt(doc.date)}</span></div>
      <div className="kv"><span>Job card</span><span>{job.id}</span></div>
      <div className="kv"><span>Customer</span><span>{c.name}</span></div>
      <div className="kv"><span>Vehicle</span><span>{v.plate} {vehicleName(v)}</span></div>
      <hr />
      {lines.map((l, i) => (
        <div className="ln" key={i}>
          <div>{l.code && `${l.code} `}{l.desc}</div>
          <div className="kv"><span>{l.qty} x {money(l.unit)}</span><span>{money(l.amount)}</span></div>
        </div>
      ))}
      <hr />
      <div className="kv"><span>Subtotal</span><span>{money(t.sub)}</span></div>
      <div className="kv"><span>VAT {pct(t.rate)}%</span><span>{money(t.vat)}</span></div>
      <div className="kv tot"><span>TOTAL (ETB)</span><span>{money(t.total)}</span></div>
      <hr />
      <div className="c"><b>{credit ? 'CREDIT: PAYMENT STILL DUE' : 'PAID IN CASH'}</b></div>
      {credit && <p className="sign">Customer signature: ____________</p>}
      <div className="c motto">{g.motto}</div>
    </article>
  );
}
