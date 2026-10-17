import { dt, money, pct } from '../lib/format.js';
import { GARAGE, Letterhead } from './InvoiceDoc.jsx';

// A point-of-sale document. Cash and credit sales are 80 mm receipts (invoices); a proforma is an A4 quotation that can show or hide the part numbers.
export const saleSize = sale => (sale.kind === 'Proforma' ? 'a4' : 'pos');

/** sale: { id, kind, status, created, cust_name, cust_phone, cust_tin, lines: [{ code, name, qty, price }], totals: { sub, vat, total, rate }, show_codes, note, by_name } */
export default function SaleDoc({ sale, garage = {} }) {
  const g = { ...GARAGE, ...garage }, t = sale.totals, credit = sale.kind === 'Credit', cancelled = sale.status === 'Cancelled';
  if (sale.kind === 'Proforma') {
    const codes = sale.show_codes !== false;
    return (
      <article className="doc a4">
        <Letterhead g={g}><h1>PROFORMA INVOICE</h1><div><b>{sale.id}</b></div><div>{dt(sale.created)}</div></Letterhead>
        <section className="two">
          <div><h4>Customer</h4><b>{sale.cust_name || '—'}</b>{sale.cust_phone && <div>{sale.cust_phone}</div>}{sale.cust_tin && <div>TIN {sale.cust_tin}</div>}</div>
          <div>{sale.note && <><h4>Note</h4><div>{sale.note}</div></>}</div>
        </section>
        <table className="items">
          <thead><tr><th>#</th>{codes && <th>Part number</th>}<th>Description</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">Amount (ETB)</th></tr></thead>
          <tbody>
            {sale.lines.map((l, i) => <tr key={i}><td>{i + 1}</td>{codes && <td>{l.code}</td>}<td>{l.name}</td><td className="r">{l.qty}</td><td className="r">{money(l.price)}</td><td className="r">{money(l.qty * l.price)}</td></tr>)}
          </tbody>
          <tfoot>
            <tr><td colSpan={codes ? 5 : 4} className="r">Subtotal</td><td className="r">{money(t.sub)}</td></tr>
            <tr><td colSpan={codes ? 5 : 4} className="r">VAT {pct(t.rate)}%</td><td className="r">{money(t.vat)}</td></tr>
            <tr className="grand"><td colSpan={codes ? 5 : 4} className="r">Total (ETB)</td><td className="r">{money(t.total)}</td></tr>
          </tfoot>
        </table>
        <p className="fine">This is a quotation, not a tax invoice. Prices and availability can change.</p>
        <p className="motto">{g.motto}</p>
      </article>
    );
  }
  return (
    <article className="doc pos">
      <div className="c"><b className="big">{g.name}</b><div>{g.address}</div><div>Tel {g.phone}</div>{g.tin && <div>TIN {g.tin}</div>}</div>
      <hr />
      <div className="c"><b>{sale.kind.toUpperCase()} INVOICE{cancelled ? ' (CANCELLED)' : ''}</b></div>
      <div className="kv"><span>No</span><span>{sale.id}</span></div>
      <div className="kv"><span>Date</span><span>{dt(sale.created)}</span></div>
      <div className="kv"><span>Customer</span><span>{sale.cust_name}</span></div>
      {sale.cust_tin && <div className="kv"><span>Customer TIN</span><span>{sale.cust_tin}</span></div>}
      <hr />
      {sale.lines.map((l, i) => (
        <div className="ln" key={i}>
          <div>{l.code} {l.name}</div>
          <div className="kv"><span>{l.qty} x {money(l.price)}</span><span>{money(l.qty * l.price)}</span></div>
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
