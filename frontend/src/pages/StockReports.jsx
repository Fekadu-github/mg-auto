// Reports for the parts business: sales, lost sales, inventory control and the user-defined report.
// Sales and lost sales are for the Service Advisor and the manager; inventory control and the user-defined report show costs, so they are the manager's.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field, Pill, Stat, Table } from '../components/ui.jsx';
import { isMgr } from '../lib/constants.js';
import { buildReport, OPS } from '../lib/customReport.js';
import { dt, downloadCsv, money, today } from '../lib/format.js';
import { downloadXlsx } from '../lib/xlsx.js';

const TABS = [['sales', 'Sales'], ['lost', 'Lost sales'], ['inv', 'Inventory control', true], ['custom', 'User-defined report', true]];

export default function StockReports() {
  const { me, say } = useApp(), mgr = isMgr(me);
  const [tab, setTab] = useState('sales'), [range, setRange] = useState({ from: today(), to: today() });
  const tabs = TABS.filter(t => !t[2] || mgr);
  return (
    <>
      <div className="box mt">
        <div className="row">
          {tabs.map(([k, n]) => <Btn key={k} kind={tab === k ? '' : 'ol'} onClick={() => setTab(k)}>{n}</Btn>)}
        </div>
        {tab !== 'inv' && <div className="row mt">
          <Field label="From" type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} />
          <Field label="To" type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} />
          <Btn kind="ol" onClick={() => setRange({ from: today(), to: today() })}>Today</Btn>
        </div>}
        <p className="mu small">Days are Addis Ababa days. Cancelled sales and proformas are not counted as sales.</p>
      </div>
      {tab === 'sales' && <SalesReport range={range} say={say} />}
      {tab === 'lost' && <LostReport range={range} say={say} />}
      {tab === 'inv' && mgr && <InventoryReport say={say} />}
      {tab === 'custom' && mgr && <CustomReport range={range} say={say} />}
    </>
  );
}

// loads one report whenever the dates change
function useReport(path, range, say, dated = true) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    setData(null);
    api(path + (dated ? `?from=${range.from}&to=${range.to}` : '')).then(d => live && setData(d)).catch(e => say(e.message));
    return () => { live = false; };
  }, [path, range.from, range.to, dated]);   // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

function SalesReport({ range, say }) {
  const d = useReport('/reports/sales', range, say);
  if (!d) return <p className="mu mt">Loading…</p>;
  const csv = () => downloadCsv(`sales_${range.from}_${range.to}.csv`, [['Date', 'Number', 'Type', 'Customer', 'TIN', 'Subtotal', 'VAT', 'Total (ETB)', 'By']].concat(d.sales.map(x => [dt(x.date), x.id, x.kind, x.customer, x.tin, x.sub, x.vat, x.total, x.by])));
  return (
    <>
      <div className="row mt"><h2 style={{ flex: 1 }}>Point-of-sale sales</h2><Btn kind="ol" onClick={csv}>Download CSV</Btn></div>
      <div className="g g2 mt">{[['Sales', d.sum.count], ['Cash sales', money(d.sum.cash)], ['Credit sales', money(d.sum.credit)], ['Total incl. VAT (ETB)', money(d.sum.total)]].map(([a, b]) => <Stat key={a} label={a} value={b} small />)}</div>
      {d.cancelled.count > 0 && <p className="mu small">{d.cancelled.count} cancelled sale(s) worth ETB {money(d.cancelled.total)} are left out.</p>}
      <div className="mt"><Table head={['Day', ...['Sales', 'Cash', 'Credit', 'Subtotal', 'VAT', 'Total'].map(t => ({ t, r: 1 }))]} empty={!d.days.length && 'No sales in this period.'}>
        {d.days.map(x => <tr key={x.day}><td>{x.day}</td><td className="r">{x.count}</td><td className="r">{money(x.cash)}</td><td className="r">{money(x.credit)}</td><td className="r">{money(x.sub)}</td><td className="r">{money(x.vat)}</td><td className="r"><b>{money(x.total)}</b></td></tr>)}
      </Table></div>
      {d.items.length > 0 && <><h3 className="mt">Parts sold</h3><Table head={['Part number', 'Description', { t: 'Quantity', r: 1 }, { t: 'Amount (before VAT)', r: 1 }]}>
        {d.items.map(x => <tr key={x.code}><td><b>{x.code}</b></td><td>{x.name}</td><td className="r">{x.qty}</td><td className="r">{money(x.amount)}</td></tr>)}
      </Table></>}
      {d.sales.length > 0 && <><h3 className="mt">Sales</h3><Table head={['Date', 'Number', 'Type', 'Customer', 'TIN', { t: 'Total', r: 1 }, 'By']}>
        {d.sales.map(x => <tr key={x.id}><td>{dt(x.date)}</td><td>{x.id}</td><td>{x.kind}</td><td>{x.customer}</td><td>{x.tin}</td><td className="r">{money(x.total)}</td><td>{x.by}</td></tr>)}
      </Table></>}
    </>
  );
}

function LostReport({ range, say }) {
  const d = useReport('/reports/lost', range, say);
  if (!d) return <p className="mu mt">Loading…</p>;
  const csv = () => downloadCsv(`lost_sales_${range.from}_${range.to}.csv`, [['When', 'Part number', 'Description', 'Quantity', 'Price', 'Reason', 'Where', 'Reference', 'By']].concat(d.rows.map(x => [dt(x.at), x.code, x.name, x.qty, x.price, x.reason, x.source, x.ref, x.by_name])));
  return (
    <>
      <div className="row mt"><h2 style={{ flex: 1 }}>Lost sales</h2><Btn kind="ol" onClick={csv}>Download CSV</Btn></div>
      <p className="mu small">Written down whenever someone tries to sell or issue a part that is out of stock, short, or not in the stock list. It shows what to buy.</p>
      <div className="g g2 mt">{[['Attempts', d.count], ['Quantity wanted', d.qty], ['Value (before VAT)', money(d.value)]].map(([a, b]) => <Stat key={a} label={a} value={b} small />)}</div>
      <div className="mt"><Table head={['Part number', 'Description', { t: 'Attempts', r: 1 }, { t: 'Quantity', r: 1 }, { t: 'Value', r: 1 }]} empty={!d.items.length && 'No lost sales in this period.'}>
        {d.items.map((x, i) => <tr key={i}><td><b>{x.code || '—'}</b></td><td>{x.name}</td><td className="r">{x.attempts}</td><td className="r">{x.qty}</td><td className="r">{money(x.value)}</td></tr>)}
      </Table></div>
      {d.rows.length > 0 && <><h3 className="mt">Every attempt</h3><Table head={['When', 'Part number', 'Description', { t: 'Qty', r: 1 }, 'Reason', 'Where', 'By']}>
        {d.rows.map(x => <tr key={x.id}><td>{dt(x.at)}</td><td>{x.code}</td><td>{x.name}</td><td className="r">{x.qty}</td><td>{x.reason}</td><td>{x.source}{x.ref ? ` · ${x.ref}` : ''}</td><td>{x.by_name}</td></tr>)}
      </Table></>}
    </>
  );
}

function InventoryReport({ say }) {
  const [range, setRange] = useState({ from: today(), to: today() }), [status, setStatus] = useState('');
  const d = useReport('/reports/inventory', range, say);
  const rows = (d?.items || []).filter(i => !status || i.status === status);
  const head = ['Part number', 'Description', 'Make', 'Category', 'In stock', 'Minimum', 'Status', 'Cost', 'Price', 'Value at cost', 'Value at price', 'Received', 'Sold', 'Issued on job cards', 'Returned', 'Adjusted'];
  const line = i => [i.code, i.name, i.make, i.category, i.stock, i.reorder, i.status, i.cost, i.price, i.value_cost, i.value_price, i.received, i.sold, i.issued, i.returned, i.adjusted];
  return (
    <>
      <div className="row mt">
        <Field label="Movements from" type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} />
        <Field label="to" type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} />
        <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option>OK</option><option>Low</option><option>Out of stock</option></select></Field>
        <Btn kind="ol" onClick={() => downloadXlsx(`inventory_control_${range.to}.xlsx`, [head, ...rows.map(line)], 'Inventory control')}>Export to Excel</Btn>
      </div>
      {!d ? <p className="mu mt">Loading…</p> : <>
        <div className="g g2 mt">{[['Items', d.sum.items], ['Units in stock', d.sum.units], ['Value at cost', money(d.sum.value_cost)], ['Value at price', money(d.sum.value_price)], ['Low', d.sum.low], ['Out of stock', d.sum.out]].map(([a, b]) => <Stat key={a} label={a} value={b} small />)}</div>
        <p className="mu small">Received, sold, issued, returned and adjusted are the quantity movements between the dates above; the stock, cost and values are as of now.</p>
        <div className="mt"><Table head={['Part number', 'Description', { t: 'In stock', r: 1 }, { t: 'Minimum', r: 1 }, 'Status', { t: 'Value at cost', r: 1 }, { t: 'Received', r: 1 }, { t: 'Sold', r: 1 }, { t: 'Issued', r: 1 }, { t: 'Returned', r: 1 }, { t: 'Adjusted', r: 1 }]} empty={!rows.length && 'No parts.'}>
          {rows.map(i => <tr key={i.id}><td><b>{i.code}</b></td><td>{i.name}</td><td className="r">{i.stock}</td><td className="r">{i.reorder}</td><td>{i.status === 'OK' ? <Pill tone="g">OK</Pill> : <Pill tone="a">{i.status}</Pill>}</td><td className="r">{money(i.value_cost)}</td><td className="r">{i.received}</td><td className="r">{i.sold}</td><td className="r">{i.issued}</td><td className="r">{i.returned}</td><td className="r">{i.adjusted}</td></tr>)}
        </Table></div>
      </>}
    </>
  );
}

// The manager picks what to look at, the columns, a filter, a sort and an optional grouping. The server only supplies flat rows.
function CustomReport({ range, say }) {
  const [sources, setSources] = useState([]), [key, setKey] = useState('stock'), [rows, setRows] = useState(null);
  const [pick, setPick] = useState(null), [filter, setFilter] = useState({ col: '', op: 'contains', value: '' }), [sort, setSort] = useState(''), [dir, setDir] = useState('asc'), [group, setGroup] = useState('');
  useEffect(() => { api('/reports/custom').then(setSources).catch(e => say(e.message)); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const src = sources.find(s => s.key === key);
  useEffect(() => {
    if (!src) return;
    let live = true;
    setRows(null); setPick(null); setSort(''); setGroup(''); setFilter({ col: '', op: 'contains', value: '' });
    api(`/reports/custom/${key}` + (src.dated ? `?from=${range.from}&to=${range.to}` : '')).then(d => live && setRows(d.rows)).catch(e => say(e.message));
    return () => { live = false; };
  }, [key, src?.key, src?.dated ? range.from : '', src?.dated ? range.to : '']);   // eslint-disable-line react-hooks/exhaustive-deps
  const out = useMemo(() => (src && rows ? buildReport(rows, src.columns, { pick, filter: filter.value === '' ? null : { ...filter, col: filter.col || undefined }, sort: sort || undefined, dir, group: group || undefined }) : null), [src, rows, pick, filter, sort, dir, group]);
  const shown = pick || src?.columns.map(c => c.key) || [];
  const toggle = k => setPick(shown.includes(k) ? shown.filter(x => x !== k) : [...shown, k]);
  const cell = (v, num) => (num && typeof v === 'number' ? money(v) : v);
  return (
    <>
      <div className="box mt">
        <div className="row">
          <Field label="What to report on"><select value={key} onChange={e => setKey(e.target.value)}>{sources.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
          <Field label="Sort by"><select value={sort} onChange={e => setSort(e.target.value)}><option value="">—</option>{src?.columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
          <Field label="Order"><select value={dir} onChange={e => setDir(e.target.value)}><option value="asc">Low to high / A to Z</option><option value="desc">High to low / Z to A</option></select></Field>
          <Field label="Group by (adds totals)"><select value={group} onChange={e => setGroup(e.target.value)}><option value="">No grouping</option>{src?.columns.filter(c => c.type !== 'num').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
        </div>
        <div className="row mt">
          <Field label="Filter: column"><select value={filter.col} onChange={e => setFilter({ ...filter, col: e.target.value })}><option value="">Any column</option>{src?.columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
          <Field label="is"><select value={filter.op} onChange={e => setFilter({ ...filter, op: e.target.value })}>{OPS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
          <Field label="Value" value={filter.value} onChange={e => setFilter({ ...filter, value: e.target.value })} />
        </div>
        {!group && src && <div className="mt"><span className="mu small">Columns: </span>{src.columns.map(c => <label key={c.key} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginRight: 14, fontSize: 13, color: 'var(--tx)' }}><input type="checkbox" style={{ width: 'auto' }} checked={shown.includes(c.key)} onChange={() => toggle(c.key)} />{c.label}</label>)}</div>}
      </div>
      {!out ? <p className="mu mt">Loading…</p> : <>
        <div className="row mt"><h2 style={{ flex: 1 }}>{src?.label} · {out.rows.length} row(s)</h2>
          <Btn kind="ol" onClick={() => downloadCsv(`report_${key}.csv`, [out.head, ...out.rows])}>Download CSV</Btn>
          <Btn kind="ol" onClick={() => downloadXlsx(`report_${key}.xlsx`, [out.head, ...out.rows], 'Report')}>Export to Excel</Btn></div>
        <div className="mt"><Table head={out.head.map((h, i) => (out.numeric[i] ? { t: h, r: 1 } : h))} empty={!out.rows.length && 'Nothing matches.'}>
          {out.rows.slice(0, 1000).map((r, i) => <tr key={i}>{r.map((v, k) => <td key={k} className={out.numeric[k] ? 'r' : ''}>{cell(v, out.numeric[k])}</td>)}</tr>)}
        </Table></div>
        {out.rows.length > 1000 && <p className="mu small">The first 1,000 rows are shown. Download the file to see all of them.</p>}
      </>}
    </>
  );
}
