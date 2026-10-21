import { dt, money, cur } from '../lib/format.js';
import { GARAGE, Letterhead } from './InvoiceDoc.jsx';

/** Goods received note on A4: supplier, every part with quantity and cost, total cost. grn: { id, supplier, ref, note, lines, total, created, by_name } */
export default function GrnDoc({ grn, garage = {} }) {
  const g = { ...GARAGE, ...garage };
  return (
    <article className="doc a4">
      <Letterhead g={g}><h1>GOODS RECEIVED NOTE</h1><div><b>{grn.id}</b></div><div>{dt(grn.created)}</div></Letterhead>
      <section className="two">
        <div><h4>Supplier</h4><b>{grn.supplier}</b>{grn.ref && <div>Invoice / delivery no {grn.ref}</div>}</div>
        <div><h4>Received by</h4><b>{grn.by_name}</b>{grn.note && <div>{grn.note}</div>}</div>
      </section>
      <table className="items">
        <thead><tr><th>#</th><th>Part number</th><th>Description</th><th className="r">Qty</th><th className="r">Cost each</th><th className="r">Amount ({cur()})</th></tr></thead>
        <tbody>
          {grn.lines.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{l.code}</td><td>{l.name}</td><td className="r">{l.qty}</td><td className="r">{money(l.cost)}</td><td className="r">{money(l.qty * l.cost)}</td></tr>)}
        </tbody>
        <tfoot><tr className="grand"><td colSpan="5" className="r">Total cost ({cur()})</td><td className="r">{money(grn.total)}</td></tr></tfoot>
      </table>
      <p className="sign">Received by: ______________________ &nbsp;&nbsp; Checked by: ______________________ &nbsp;&nbsp; Date: ____________</p>
    </article>
  );
}
