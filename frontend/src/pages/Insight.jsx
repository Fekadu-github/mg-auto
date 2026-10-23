// Two screens: Service due (vehicles that need their next service, with a reminder) and Stock insight (idle parts, top sellers, what to buy).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Pill, Table } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { serviceDue } from '../lib/insight.js';
import { dt, km, money } from '../lib/format.js';

export function ServiceDue() {
  const { db, run, say, openModal } = useApp();
  const [sent, setSent] = useState({}), [busy, setBusy] = useState('');
  const list = serviceDue(db);
  useEffect(() => { api('/service-due/reminders').then(r => setSent(Object.fromEntries(r.map(x => [x.vid + ':' + x.next_km, x])))).catch(() => {}); }, []);
  const last = r => sent[r.v.id + ':' + r.v.next_km];
  const remind = async (r, force) => {
    setBusy(r.v.id);
    const x = await run(() => api('/service-due/remind', 'POST', { vid: r.v.id, force: !!force }));
    setBusy('');
    if (x.ok) { say(`Reminder sent to ${r.c.name} by ${x.data.channel === 'telegram' ? 'Telegram' : 'SMS'}.`); setSent(s => ({ ...s, [r.v.id + ':' + r.v.next_km]: { channel: x.data.channel, at: new Date().toISOString() } })); }
  };
  const todo = list.filter(r => !last(r));
  const all = async () => { for (const r of todo) await remind(r); };
  return (
    <>
      <div className="row mt bar">
        <span className="mu small" style={{ flex: 1 }}>Vehicles within 1,000 km of their next service, or past it. The mileage is the one saved on the vehicle (it moves forward when a job card with a service is closed).</span>
        {todo.length > 0 && <Btn onClick={all} disabled={!!busy}><Icon name="send" size={16} /> Remind all not yet reminded ({todo.length})</Btn>}
      </div>
      <div className="mt"><Table head={['Plate', 'Customer', 'Service', { t: 'Mileage', r: 1 }, { t: 'Due at', r: 1 }, 'Status', 'Reminder', '']} empty={!list.length && 'No vehicle is due for service now.'}>
        {list.map(r => (
          <tr key={r.v.id} className={r.level === 'over' ? 'late' : ''}>
            <td><button type="button" className="lnk" onClick={() => openModal('vehicle', { id: r.v.id })}>{r.v.plate}</button></td>
            <td>{r.c.name}<div className="mu small">{r.c.phone}</div></td><td>{r.what}</td><td className="r">{km(r.v.mileage)}</td><td className="r">{km(r.v.next_km)}</td>
            <td>{r.level === 'over' ? <Pill tone="r">{km(-r.left)} over</Pill> : <Pill tone="a">in {km(r.left)}</Pill>}</td>
            <td>{last(r) ? <span className="mu small">Sent {last(r).channel === 'telegram' ? 'by Telegram' : 'by SMS'} {last(r).at ? dt(last(r).at) : ''}</span> : <span className="mu small">{r.c.tg ? 'Telegram linked' : 'No Telegram: SMS if set up'}</span>}</td>
            <td className="acts"><Btn kind="ol" disabled={busy === r.v.id} onClick={() => remind(r, !!last(r))}>{last(r) ? 'Send again' : 'Send reminder'}</Btn></td>
          </tr>))}
      </Table></div>
    </>
  );
}

export function StockInsight() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [days, setDays] = useState(90);
  useEffect(() => { setD(null); api('/insight/stock?days=' + days).then(setD).catch(e => setErr(e.message)); }, [days]);
  if (err) return <p role="alert" className="mt" style={{ color: 'var(--rd)' }}>{err}</p>;
  if (!d) return <p className="mu mt">Loading…</p>;
  const idleValue = d.idle.reduce((a, p) => a + p.value, 0);
  return (
    <>
      <h2 className="mt">What to buy</h2>
      <p className="mu small">From the lost sales of the last 90 days: what customers asked for and could not get, most asked first.</p>
      <Table head={['Part', 'Asked', { t: 'Quantity', r: 1 }, { t: 'Price', r: 1 }, 'Last asked', 'Now']} empty={!d.buy.length && 'No lost sales recorded in the last 90 days.'}>
        {d.buy.map(b => <tr key={b.code + b.name}><td><b>{b.code}</b> {b.name}</td><td>{b.times}×</td><td className="r">{b.qty}</td><td className="r">{b.price ? money(b.price) : '—'}</td><td>{dt(b.last_at)}</td><td>{b.in_stock === null ? <Pill tone="a">not in stock list</Pill> : b.in_stock > 0 ? <Pill tone="g">{b.in_stock} in stock</Pill> : <Pill tone="r">out of stock</Pill>}</td></tr>)}
      </Table>
      <h2 className="mt">Top sellers (last 90 days)</h2>
      <Table head={['Part', { t: 'Sold', r: 1 }, { t: 'In stock', r: 1 }, '']} empty={!d.top.length && 'No sales yet.'}>
        {d.top.map(p => <tr key={p.id}><td><b>{p.code}</b> {p.name}</td><td className="r">{p.sold}</td><td className="r">{p.stock}</td><td>{p.stock <= p.reorder && <Pill tone="a">reorder</Pill>}</td></tr>)}
      </Table>
      <div className="row mt"><h2 style={{ flex: 1, margin: 0 }}>No movement in {days} days</h2>
        <select aria-label="Days without movement" value={days} onChange={e => setDays(+e.target.value)} style={{ flex: '0 0 auto' }}>{[60, 90, 180, 365].map(n => <option key={n} value={n}>{n} days</option>)}</select></div>
      <p className="mu small">{d.idle.length} part(s) with stock and no sale, issue or purchase{d.idle.length ? ` · ${money(idleValue)} tied up at cost` : ''}.{d.idle.length >= 100 ? ' Showing the 100 with the most money in them.' : ''}</p>
      <Table head={['Part', { t: 'In stock', r: 1 }, { t: 'Value at cost', r: 1 }, 'Last movement']} empty={!d.idle.length && 'Every part with stock has moved.'}>
        {d.idle.map(p => <tr key={p.id}><td><b>{p.code}</b> {p.name}</td><td className="r">{p.stock}</td><td className="r">{money(p.value)}</td><td>{p.last_move ? dt(p.last_move) : <span className="mu">never</span>}</td></tr>)}
      </Table>
    </>
  );
}
