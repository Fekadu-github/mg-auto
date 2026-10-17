// The screens behind the sidebar: Dashboard, Job cards, Workshop, Customers, Parts stock, Reports, Staff.
import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field, Pill, Stat, StatusPill, Table, useForm } from '../components/ui.jsx';
import { NotifySelect } from '../dialogs/Dialogs.jsx';
import { ROLES, SECTIONS, isSA, isTech } from '../lib/constants.js';
import { InsuranceFields } from '../dialogs/Dialogs.jsx';
import { SECTION_CODE, sectionOption } from '../lib/constants.js';
import { usePersistedForm } from '../lib/autosave.js';
import { activeClock, dt, downloadCsv, jobTotals, km, money, tot, today, vehicleName } from '../lib/format.js';

export const PAGE_INFO = {
  dash: ['Garage today', 'Today in the garage: what is waiting to be dispatched, in the workshop, ready to close, or waiting for hand-over.'],
  jobs: ['Job cards', 'Every job card from creation to delivery. Open one to dispatch it, clock labour, issue parts, close it and invoice.'],
  shop: ['Workshop', 'Job cards sent to the workshop and the technicians who are clocked in now.'],
  pro: ['Insurance proformas', 'First-hand proformas for insurance, made before the job card: estimator, insurance, labour and parts. Everything saves by itself; the job card is created from an issued proforma.'],
  ins: ['Insurance companies', 'The registered insurance companies. Pick one on a customer profile or on a proforma.'],
  lab: ['Labour list', 'The labour tasks (BP body & paints, ME mechanical) that are picked on proformas, estimates and job cards. Hours x labour rate gives the cost, unless a fixed price is set.'],
  est: ['Estimates', 'Body & Paints estimates. A draft can be changed; a finalized estimate is locked and is loaded on a job card by its number.'],
  svc: ['Services', 'Type A, B and C services: how often they are due and the labour and parts each one adds to a job card.'],
  cust: ['Customers', 'Customers and their vehicles. These details feed every job card.'],
  inv: ['Parts stock', 'Part numbers, prices and quantities. Cost and price are set by the manager (price = cost x 1.3 unless changed). Every stock change is kept in the part’s history.'],
  pur: ['Purchases (GRN)', 'Parts bought and added to stock, with the quantity and cost of each. Search the stock list to add a part.'],
  pos: ['Point of sale', 'Sell parts directly: cash sale, credit sale or proforma. Search parts by name or part number. Sales go to Invoices & payments by themselves.'],
  invc: ['Invoices & payments', 'Every cash and credit invoice from job cards and the point of sale, what was paid and what is still owed.'],
  srep: ['Stock & sales reports', 'Sales, lost sales, inventory control and your own reports.'],
  rep: ['Reports', 'Job card revenue and technician hours for the days you choose.'],
  staff: ['Staff', 'Staff accounts and their roles.']
};

function JobTable({ list }) {
  const { db, cust, veh, openModal } = useApp();
  return (
    <Table head={['Job card', 'Customer', 'Vehicle', 'Status', { t: 'Total', r: 1 }]} empty={!list.length && 'Nothing here yet.'}>
      {list.map(j => (
        <tr key={j.id} className="k" tabIndex={0} onClick={() => openModal('job', { id: j.id })} onKeyDown={e => e.key === 'Enter' && openModal('job', { id: j.id })}>
          <td><b>{j.id}</b></td><td>{cust(j.cid).name}</td><td>{veh(j.vid).plate} {vehicleName(veh(j.vid))}</td><td><StatusPill status={j.status} /></td><td className="r">{money(jobTotals(j, db.cfg.vat).total)}</td>
        </tr>
      ))}
    </Table>
  );
}

export function Dashboard() {
  const { db, me } = useApp();
  const n = s => db.j.filter(j => s.includes(j.status)).length;
  const stats = [['Waiting to dispatch', n(['Created'])], ['In workshop', n(['Dispatched', 'At workshop'])], ['Ready for SA to close', n(['Work done', 'Back with SA'])], ['Awaiting invoice or hand-over', n(['Closed', 'Invoiced'])]];
  if (!isTech(me)) stats.push(['Parts to reorder', db.p.filter(p => p.stock <= p.reorder).length]);
  return (
    <>
      <div className="g g2 mt">{stats.map(([a, b]) => <Stat key={a} label={a} value={b} />)}</div>
      <h2 className="mt">Latest job cards</h2>
      <JobTable list={db.j.slice(0, 8)} />
      <p className="mu mt">Customers: {db.c.length} · Vehicles: {db.v.length} · Job cards: {db.j.length}</p>
    </>
  );
}

export function JobCards() {
  const { db, me, cust, veh, openModal } = useApp();
  const [q, setQ] = useState('');
  const list = db.j.filter(j => (j.id + cust(j.cid).name + veh(j.vid).plate).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row mt"><input aria-label="Search job cards" placeholder="Search by job card, customer or plate" value={q} onChange={e => setQ(e.target.value)} />{isSA(me) && <Btn onClick={() => (db.c.length ? openModal('newJob') : alert('Add a customer first.'))}>New job card</Btn>}</div>
      <div className="mt"><JobTable list={list} /></div>
    </>
  );
}

export function Workshop() {
  const { db, openModal } = useApp();
  const [sec, setSec] = useState('');
  const live = db.j.flatMap(j => j.labours.map(l => ({ j, l, a: activeClock(l) })).filter(x => x.a));
  const list = db.j.filter(j => ['Dispatched', 'At workshop'].includes(j.status) && (!sec || j.labours.some(l => l.section === sec)));
  return (
    <>
      <div className="row mt"><Field label="Section"><select value={sec} onChange={e => setSec(e.target.value)}><option value="">All sections</option>{SECTIONS.map(s => <option key={s}>{s}</option>)}</select></Field></div>
      <h2 className="mt">Clocked in now</h2>
      <Table head={['Technician', 'Work', 'Job card', 'Since']} empty={!live.length && 'Nobody is clocked in.'}>
        {live.map(({ j, l, a }) => <tr key={l.id} className="k" onClick={() => openModal('job', { id: j.id })}><td>{a.tech}</td><td>{l.desc}</td><td>{j.id}</td><td>{dt(a.in)}</td></tr>)}
      </Table>
      <h2 className="mt">Job cards for the workshop</h2>
      <div className="mt"><JobTable list={list} /></div>
    </>
  );
}

export function Proformas() {
  const { db, me, cust, veh, openModal } = useApp();
  const [q, setQ] = useState('');
  const list = db.pr.filter(p => (p.id + cust(p.cid).name + veh(p.vid).plate + p.estimator).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row mt"><input aria-label="Search proformas" placeholder="Search by number, customer, plate or estimator" value={q} onChange={x => setQ(x.target.value)} />{isSA(me) && <Btn onClick={() => (db.c.length ? openModal('newProforma') : alert('Add a customer first.'))}>New proforma</Btn>}</div>
      <div className="mt"><Table head={['Estimation no', 'Date', 'Customer', 'Vehicle', 'Insurance', 'Estimator', 'Status', { t: 'Total', r: 1 }]} empty={!list.length && 'No proformas yet.'}>
        {list.map(p => (
          <tr key={p.id} className="k" tabIndex={0} onClick={() => openModal('proforma', { id: p.id })} onKeyDown={x => x.key === 'Enter' && openModal('proforma', { id: p.id })}>
            <td><b>{p.id}</b></td><td>{p.pdate}</td><td>{cust(p.cid).name}</td><td>{veh(p.vid).plate}</td><td>{db.ins.find(i => i.id === p.insurer_id)?.name || <span className="mu">customer pays</span>}</td>
            <td>{p.estimator}</td><td><Pill tone={p.status === 'Draft' ? 'a' : 'g'}>{p.status === 'Converted' ? `→ ${p.job}` : p.status}</Pill></td><td className="r">{money(tot(p, db.cfg.vat).total)}</td>
          </tr>
        ))}
      </Table></div>
    </>
  );
}

export function Insurance() {
  const { db, me, run, openModal } = useApp();
  const sa = isSA(me);
  const [f, bind, , reset] = usePersistedForm('form:new-insurer', { name: '', phone: '' });
  const add = async () => { if (!f.name.trim()) return alert('Enter the company name.'); const r = await run(() => api('/insurers', 'POST', f)); if (r.ok) reset(); };
  return (
    <>
      {sa && <div className="box mt"><h3>New insurance company</h3><div className="row"><Field label="Company name" grow="3 1 200px" {...bind('name')} /><Field label="Phone" {...bind('phone')} /><Btn onClick={add}>Save company</Btn></div></div>}
      <div className="mt"><Table head={['Company', 'Phone', 'Customers', '']} empty={!db.ins.length && 'No insurance companies yet.'}>
        {db.ins.map(i => <tr key={i.id}><td><b>{i.name}</b></td><td>{i.phone}</td><td>{db.c.filter(c => c.insurer_id === i.id).length}</td><td className="acts">{sa && <Btn kind="ol" onClick={() => openModal('insurer', { id: i.id })}>Edit</Btn>}</td></tr>)}
      </Table></div>
    </>
  );
}

export function LabourList() {
  const { db, me, run, openModal } = useApp();
  const sa = isSA(me), rate = db.cfg.labourRate, [q, setQ] = useState('');
  const [f, bind, , reset] = usePersistedForm('form:new-task', { name: '', section: SECTIONS[1], hours: '', price: '' });
  const add = async () => {
    if (!f.name.trim()) return alert('Describe the task.');
    const r = await run(() => api('/labour-tasks', 'POST', { name: f.name, section: f.section, hours: parseFloat(f.hours) || 0, price: parseFloat(f.price) || 0 }));
    if (r.ok) reset();
  };
  const list = db.lt.filter(t => (t.name + SECTION_CODE[t.section]).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      {sa && <div className="box mt"><h3>New labour task</h3><div className="row">
        <Field label="Task" grow="3 1 200px" {...bind('name')} /><Field label="Section"><select {...bind('section')}>{SECTIONS.map(s => <option key={s} value={s}>{sectionOption(s)}</option>)}</select></Field>
        <Field label="Hours" type="number" min="0" step="0.25" {...bind('hours')} /><Field label="Fixed price (ETB), empty = hours x rate" type="number" min="0" {...bind('price')} /><Btn onClick={add}>Save task</Btn>
      </div></div>}
      <div className="mt"><input aria-label="Search tasks" placeholder="Search tasks or BP / ME" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="mt"><Table head={['Section', 'Task', { t: 'Hours', r: 1 }, { t: 'Cost (ETB)', r: 1 }, '']} empty={!list.length && 'No labour tasks yet.'}>
        {list.map(t => <tr key={t.id}><td><b>{SECTION_CODE[t.section]}</b> <span className="mu small">{t.section}</span></td><td>{t.name}</td><td className="r">{t.hours}</td><td className="r">{money(t.price || Math.round(t.hours * rate * 100) / 100)}{!t.price && <span className="mu small"> ({t.hours} x {rate})</span>}</td><td className="acts">{sa && <Btn kind="ol" onClick={() => openModal('labourTask', { id: t.id })}>Edit</Btn>}</td></tr>)}
      </Table></div>
    </>
  );
}

export function Estimates() {
  const { db, me, cust, veh, openModal } = useApp();
  const [q, setQ] = useState('');
  const list = db.e.filter(e => (e.id + cust(e.cid).name + veh(e.vid).plate + e.note).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row mt"><input aria-label="Search estimates" placeholder="Search by estimate number, customer or plate" value={q} onChange={x => setQ(x.target.value)} />{isSA(me) && <Btn onClick={() => (db.c.length ? openModal('newEstimate') : alert('Add a customer first.'))}>New estimate</Btn>}</div>
      <div className="mt"><Table head={['Estimate', 'Customer', 'Vehicle', 'Status', 'Loaded on', { t: 'Total', r: 1 }]} empty={!list.length && 'No estimates yet.'}>
        {list.map(e => (
          <tr key={e.id} className="k" tabIndex={0} onClick={() => openModal('estimate', { id: e.id })} onKeyDown={x => x.key === 'Enter' && openModal('estimate', { id: e.id })}>
            <td><b>{e.id}</b></td><td>{cust(e.cid).name}</td><td>{veh(e.vid).plate} {vehicleName(veh(e.vid))}</td>
            <td><Pill tone={e.status === 'Finalized' ? 'g' : 'a'}>{e.status}</Pill></td><td>{e.used_in || <span className="mu">not yet</span>}</td><td className="r">{money(tot(e, db.cfg.vat).total)}</td>
          </tr>
        ))}
      </Table></div>
    </>
  );
}

export function Services() {
  const { db, me, openModal } = useApp();
  return (
    <>
      <div className="mt"><Table head={['Type', 'Due every', 'Labour', 'Parts', '']} empty={!db.st.length && 'No services set up.'}>
        {db.st.map(t => (
          <tr key={t.code}>
            <td><b>{t.name}</b></td><td>{km(t.interval_km)}</td>
            <td>{t.labours.map(l => l.desc).join(', ') || <span className="mu">none</span>}</td>
            <td>{t.parts.map(p => `${p.qty} x ${p.code || p.name}`).join(', ') || <span className="mu">none</span>}</td>
            <td className="acts">{isSA(me) && <Btn kind="ol" onClick={() => openModal('service', { code: t.code })}>Edit</Btn>}</td>
          </tr>
        ))}
      </Table></div>
      <p className="mu mt">When a job card with a service is closed, the vehicle's mileage moves forward and the next service is suggested: the next milestone of any type, named after the largest interval that fits it (for example every 5,000 km A, 10,000 km B, 20,000 km C: after an A at 5,000 km comes a B at 10,000 km).</p>
    </>
  );
}

export function Customers() {
  const { db, me, run, openModal } = useApp();
  const sa = isSA(me);
  const [f, bind, , reset] = usePersistedForm('form:new-customer', { name: '', phone: '', city: 'Addis Ababa', sub: '', woreda: '', house: '', dob: '', notify: 'both', insurer_id: '', policy_no: '', tin: '' });
  const add = async () => {
    if (!f.name.trim() || !f.phone.trim()) return alert('Name and phone are required.');
    const r = await run(() => api('/customers', 'POST', { ...f, dob: f.dob || null }));
    if (r.ok) reset();
  };
  return (
    <>
      {sa && <div className="box mt"><h3>New customer</h3><div className="row">
        <Field label="Name" {...bind('name')} /><Field label="Phone" type="tel" {...bind('phone')} /><Field label="City" {...bind('city')} /><Field label="Subcity" {...bind('sub')} />
        <Field label="Woreda" {...bind('woreda')} /><Field label="House" {...bind('house')} /><Field label="TIN" {...bind('tin')} /><Field label="Date of birth" type="date" {...bind('dob')} /><NotifySelect bind={bind} /><InsuranceFields db={db} bind={bind} /><Btn onClick={add}>Save customer</Btn>
      </div></div>}
      <div className="mt"><Table head={['ID', 'Name', 'Phone', 'TIN', 'Area', 'Vehicles', 'Telegram', '']} empty={!db.c.length && 'No customers yet. Add the first one above.'}>
        {db.c.map(c => (
          <tr key={c.id}>
            <td>{c.id}</td><td>{c.name}</td><td>{c.phone}</td><td>{c.tin}</td><td>{[c.city, c.sub].filter(Boolean).join(', ')}</td>
            <td>{db.v.filter(v => v.cid === c.id).map(v => (
              <div key={v.id}><button type="button" className="lnk" onClick={() => sa && openModal('vehicle', { id: v.id })}>{v.plate}</button>
                <span className="mu small"> {v.mileage != null ? km(v.mileage) : 'no mileage'}{v.next_km ? ` · next ${db.st.find(t => t.code === v.next_type)?.name || 'service'} at ${km(v.next_km)}` : ''}</span></div>
            ))}{!db.v.some(v => v.cid === c.id) && <span className="mu">none</span>}</td>
            <td>{c.tg ? <Pill tone="g">linked</Pill> : <span className="mu">not linked</span>}</td>
            <td className="acts">{sa && <><Btn kind="ol" onClick={() => openModal('customer', { id: c.id })}>Edit</Btn><Btn kind="ol" onClick={() => openModal('vehicle', { cid: c.id })}>Add vehicle</Btn><Btn kind="ol" onClick={() => openModal('telegram', { id: c.id })}>Telegram link</Btn></>}</td>
          </tr>
        ))}
      </Table></div>
    </>
  );
}

export function Reports() {
  const { me, openModal } = useApp();
  const tech = isTech(me), canRev = isSA(me);
  const [range, setRange] = useState({ from: today(), to: today() }), [rev, setRev] = useState(null), [hrs, setHrs] = useState(null), [err, setErr] = useState('');
  const show = async (r = range) => {
    setErr('');
    try { const qs = `?from=${r.from}&to=${r.to}`; const [a, b] = await Promise.all([canRev ? api('/reports/revenue' + qs) : null, api('/reports/hours' + qs)]); setRev(a); setHrs(b); }
    catch (e) { setErr(e.message); }
  };
  const days = hrs ? [...new Set(hrs.byDay.map(x => x.day))] : [], techs = hrs ? [...new Set(hrs.byDay.map(x => x.tech))].sort() : [];
  const hoursOf = (d, t) => hrs.byDay.find(x => x.day === d && x.tech === t)?.hours;
  return (
    <>
      <div className="box mt">
        <div className="row">
          <Field label="From" type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} />
          <Field label="To" type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} />
          <Btn onClick={() => show()}>Show</Btn><Btn kind="ol" onClick={() => { const r = { from: today(), to: today() }; setRange(r); show(r); }}>Today</Btn>
        </div>
        {err && <p role="alert" style={{ color: 'var(--rd)' }}>{err}</p>}
        <p className="mu">Days are Addis Ababa days.{!tech && ' Revenue counts cash and credit invoices on the day they were issued; proformas are quotes and are not counted.'}</p>
      </div>
      {rev && <>
        <div className="row mt"><h2 style={{ flex: 1 }}>Revenue</h2><Btn kind="ol" onClick={() => downloadCsv(`revenue_${range.from}_${range.to}.csv`, [['Date', 'Invoice', 'Job card', 'Customer', 'Plate', 'Type', 'Labour', 'Parts', 'VAT', 'Total (ETB)']].concat(rev.invoices.map(x => [dt(x.date), x.no, x.jc, x.customer, x.plate, x.type, x.labour, x.parts, x.vat, x.total])))}>Download CSV</Btn></div>
        <div className="g g2 mt">{[['Invoices', rev.sum.count], ['Cash invoices', money(rev.sum.cash)], ['Credit invoices (to collect)', money(rev.sum.credit)], ['Total incl. VAT (ETB)', money(rev.sum.total)]].map(([a, b]) => <Stat key={a} label={a} value={b} small />)}</div>
        <div className="mt"><Table head={['Day', ...['Invoices', 'Cash', 'Credit', 'Labour', 'Parts', 'VAT', 'Total'].map(t => ({ t, r: 1 }))]} empty={!rev.days.length && 'No invoices in this period.'}>
          {rev.days.map(d => <tr key={d.day}><td>{d.day}</td><td className="r">{d.count}</td><td className="r">{money(d.cash)}</td><td className="r">{money(d.credit)}</td><td className="r">{money(d.labour)}</td><td className="r">{money(d.parts)}</td><td className="r">{money(d.vat)}</td><td className="r"><b>{money(d.total)}</b></td></tr>)}
        </Table></div>
        {rev.invoices.length > 0 && <><h3 className="mt">Invoices</h3><Table head={['Issued', 'Invoice', 'Job card', 'Customer', 'Plate', 'Type', { t: 'Total', r: 1 }]}>
          {rev.invoices.map(x => <tr key={x.no} className="k" onClick={() => openModal('job', { id: x.jc })}><td>{dt(x.date)}</td><td>{x.no}</td><td>{x.jc}</td><td>{x.customer}</td><td>{x.plate}</td><td>{x.type}</td><td className="r">{money(x.total)}</td></tr>)}
        </Table></>}
      </>}
      {hrs && <>
        <div className="row mt"><h2 style={{ flex: 1 }}>{tech ? 'My hours' : 'Technician hours'} · {hrs.total.toFixed(2)} h</h2><Btn kind="ol" onClick={() => downloadCsv(`technician_hours_${range.from}_${range.to}.csv`, [['Date', 'Technician', 'Hours']].concat(hrs.byDay.map(x => [x.day, x.tech, x.hours])))}>Download CSV</Btn></div>
        <p className="mu">Time between clock-in and clock-out on labour. A clock that is still running counts up to now.</p>
        <Table head={['Technician', { t: 'Hours', r: 1 }, { t: 'Job cards', r: 1 }, { t: 'Labour items', r: 1 }, { t: 'Completed', r: 1 }, '']} empty={!hrs.byTech.length && 'No clocked time in this period.'}>
          {hrs.byTech.map(t => <tr key={t.tech}><td>{t.tech}</td><td className="r"><b>{t.hours.toFixed(2)}</b></td><td className="r">{t.jobs}</td><td className="r">{t.labours}</td><td className="r">{t.completed}</td><td>{t.open && <Pill tone="a">still clocked in</Pill>}</td></tr>)}
        </Table>
        {days.length > 0 && <><h3 className="mt">By day</h3><Table head={['Day', ...techs.map(t => ({ t, r: 1 }))]}>
          {days.map(d => <tr key={d}><td>{d}</td>{techs.map(t => <td key={t} className="r">{hoursOf(d, t) != null ? hoursOf(d, t).toFixed(2) : ''}</td>)}</tr>)}
        </Table></>}
        {hrs.bySection.length > 0 && !tech && <><h3 className="mt">By section</h3><Table head={['Section', { t: 'Hours', r: 1 }]}>{hrs.bySection.map(x => <tr key={x.section}><td>{x.section}</td><td className="r">{x.hours.toFixed(2)}</td></tr>)}</Table></>}
      </>}
      {!rev && !hrs && <p className="mu mt">Choose the dates and press <b>Show</b>.</p>}
    </>
  );
}

export function Staff() {
  const { users, run } = useApp();
  const [f, bind, , reset] = useForm({ name: '', username: '', password: '', role: 'SA' });
  const add = async () => { const r = await run(() => api('/users', 'POST', f)); if (r.ok) reset(); };
  return (
    <>
      <div className="box mt"><h3>New staff account</h3><div className="row">
        <Field label="Full name" {...bind('name')} /><Field label="Username" autoComplete="off" {...bind('username')} /><Field label="Password (8+ characters)" type="password" autoComplete="new-password" {...bind('password')} />
        <Field label="Role"><select {...bind('role')}>{Object.entries(ROLES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field><Btn onClick={add}>Create account</Btn>
      </div></div>
      <div className="mt"><Table head={['Name', 'Username', 'Role']}>{users.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.username}</td><td>{ROLES[u.role]}</td></tr>)}</Table></div>
    </>
  );
}
