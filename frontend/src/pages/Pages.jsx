// The screens behind the sidebar: Dashboard, Job cards, Workshop, Customers, Parts stock, Reports, Staff.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field, Pill, Stat, StatusPill, Table } from '../components/ui.jsx';
import { NotifySelect } from '../dialogs/Dialogs.jsx';
import { ROLES, SECTIONS, STATUSES, STATUS_NAME, isAdmin, isMgr, isSA, isTech } from '../lib/constants.js';
import Icon from '../components/Icon.jsx';
import WorkshopBoard from '../components/WorkshopBoard.jsx';
import ManagerPanel from '../components/ManagerPanel.jsx';
import MyTasks from '../components/MyTasks.jsx';
import { serviceDue } from '../lib/insight.js';
import { isOverdue } from '../lib/jobFlags.js';
import { clearNavParams, readNavParams } from '../lib/navParams.js';
import { nextSort, sortRows } from '../lib/sort.js';
import { InsuranceFields } from '../dialogs/Dialogs.jsx';
import { SECTION_CODE, sectionOption } from '../lib/constants.js';
import { usePersistedForm, usePersistedState } from '../lib/autosave.js';
import { downloadXlsx, readXlsx, rowsToObjects } from '../lib/xlsx.js';
import { groupCost, groupHours, groupTasks } from '../lib/labourGroups.js';
import { downloadLabourPdf, downloadLabourXlsx, labourRows, labourSummary } from '../lib/labourExport.js';
import TwoFactor from '../components/TwoFactor.jsx';
import CurrencyBox from '../components/CurrencyBox.jsx';
import { t } from '../lib/i18n.js';
import { activeClock, dt, downloadCsv, jobTotals, km, money, rateOf, tot, today, vehicleName, cur, MAKES } from '../lib/format.js';

const DEFAULT_MAKE_RATE = { Suzuki: 350, Toyota: 400, Others: 450 };   // the same starting rates as the server

export const PAGE_INFO = {
  dash: ['Garage today', 'Today in the garage: what is waiting to be dispatched, in the workshop, ready to close, or waiting for hand-over.'],
  jobs: ['Job cards', 'Every job card from creation to delivery. Open one to dispatch it, clock labour, issue parts, close it and invoice.'],
  shop: ['Workshop', 'Job cards sent to the workshop and the technicians who are clocked in now.'],
  pro: ['Insurance proformas', 'Proformas are made from an estimate number (draft or finalized; EST numbers are given by estimations only), for walk-ins (no registration needed) or registered customers: estimator, insurance, labour and parts. Everything saves by itself. Finalize the proforma (or its estimate: they share one EST number and finalize together). When the customer returns and agrees, the job card is created from the finalized proforma, or the estimate is picked when a job card is created.'],
  ins: ['Insurance companies', 'The registered insurance companies. Pick one on a customer profile or on a proforma.'],
  lab: ['Labour list', 'The labour tasks (BP body & paints, ME mechanical) that are picked on proformas, estimates and job cards. Hours x labour rate gives the cost, unless a fixed price is set.'],
  est: ['Estimates', 'Body & Paints estimates. A draft can be changed; Finalize locks it (and finalizes the proforma made from it). A finalized estimate is picked by its number when a job card is created.'],
  svc: ['Services', 'Type A, B, C and D services: how often they are due and the labour and parts each one adds to a job card.'],
  cust: ['Customers', 'Customers and their vehicles. These details feed every job card.'],
  inv: ['Parts stock', 'Part numbers, prices and quantities. Cost and price are set by the manager (price = cost x 1.3 unless changed). Every stock change is kept in the part’s history.'],
  pur: ['Purchases (GRN)', 'Parts bought and added to stock, with the quantity and cost of each. Search the stock list to add a part.'],
  pos: ['Point of sale', 'Sell parts directly: cash sale, credit sale or proforma. Search parts by name or part number. Sales go to Invoices & payments by themselves.'],
  invc: ['Invoices & payments', 'Every cash and credit invoice from job cards and the point of sale, what was paid and what is still owed.'],
  due: ['Service due', 'Vehicles that are due for their next service, or close to it, with a Telegram or SMS reminder for the customer.'],
  sins: ['Stock insight', 'Parts that do not move, the top sellers, and what to buy based on the sales you lost.'],
  srep: ['Stock & sales reports', 'Sales, lost sales, inventory control and your own reports.'],
  rep: ['Reports', 'Job card revenue and technician hours for the days you choose.'],
  staff: ['Staff', 'Staff accounts and their roles.'],
  audit: ['Audit log', 'Who did what and when: sign-ins, finalized estimates, deleted records, staff changes and refused attempts.']
};

function JobTable({ list, sort, onSort }) {
  const { db, me, run, cust, veh, openModal } = useApp();
  const day = today();
  const del = async j => { if (confirm(`Delete job card ${j.id}?\nParts issued on it go back to stock. This cannot be undone.`)) await run(() => api('/jobs/' + j.id, 'DELETE')); };
  return (
    <Table head={[{ t: 'Job card', k: 'id' }, { t: 'Customer', k: 'cust' }, { t: 'Vehicle', k: 'plate' }, { t: 'Status', k: 'status' }, { t: 'Due', k: 'due' }, { t: 'Total', r: 1, k: 'total' }, ...(isAdmin(me) ? [''] : [])]} sort={sort} onSort={onSort} empty={!list.length && 'Nothing here yet.'}>
      {list.map(j => (
        <tr key={j.id} className="k" tabIndex={0} onClick={() => openModal('job', { id: j.id })} onKeyDown={e => e.key === 'Enter' && openModal('job', { id: j.id })}>
          <td><b>{j.id}</b></td><td>{cust(j.cid).name}</td><td>{veh(j.vid).plate} {vehicleName(veh(j.vid))}</td><td><StatusPill status={j.status} />{(() => { const n = j.labours.filter(l => l.extra && !l.done).length; return n > 0 && <> <Pill tone="a">{n} additional</Pill></>; })()}</td><td>{j.due_date ? <>{String(j.due_date).slice(0, 10)}{isOverdue(j, day) && <> <Pill tone="r">overdue</Pill></>}</> : <span className="mu">—</span>}</td><td className="r">{money(jobTotals(j, db.cfg.vat).total)}</td>{isAdmin(me) && <td className="acts" onClick={e => e.stopPropagation()}><Btn kind="ol" onClick={() => del(j)}>Delete</Btn></td>}
        </tr>
      ))}
    </Table>
  );
}

export function Dashboard() {
  const { db, me, goPage, openModal } = useApp();
  const day = today(), n = st => db.j.filter(j => st.includes(j.status)).length, jobsOf = status => ({ page: 'jobs', params: { status } });
  // [label, number, where a click goes, optional icon / tone]
  const stats = [['Waiting to dispatch', n(['Created']), jobsOf(['Created'])], ['In workshop', n(['Dispatched', 'At workshop']), { page: 'shop' }],
    ['Ready for SA to close', n(['Work done', 'Back with SA']), jobsOf(['Work done', 'Back with SA'])], ['Awaiting invoice or hand-over', n(['Closed', 'Invoiced']), jobsOf(['Closed', 'Invoiced'])]];
  const late = db.j.filter(j => isOverdue(j, day)).length;
  if (late) stats.unshift(['Overdue job cards', late, { page: 'jobs', params: { overdue: true } }, { icon: 'alert', tone: 'a' }]);
  if (!isTech(me)) stats.push(['Parts to reorder', db.p.filter(p => p.stock <= p.reorder).length, { page: 'inv', params: { low: true } }]);
  const waitingJobs = db.j.filter(j => j.parts.some(p => p.waiting)), priceJobs = db.j.filter(j => (j.price_reqs || []).some(r => r.status === 'Requested'));
  if (waitingJobs.length) stats.push(['Job cards waiting for parts', waitingJobs.length, { page: 'jobs', params: { waiting: true } }]);
  if (isMgr(me) && priceJobs.length) stats.push(['Price changes to approve', priceJobs.length, { page: 'jobs', params: { approve: true } }]);
  const tech = isTech(me), shown = tech ? stats.filter(x => ['In workshop', 'Overdue job cards'].includes(x[0])) : stats;
  const dueCount = isSA(me) ? serviceDue(db).length : 0;
  if (dueCount) stats.push(['Vehicles due for service', dueCount, { page: 'due' }, { icon: 'calendar', tone: 'a' }]);
  const mine = isTech(me) ? db.j.filter(j => ['Dispatched', 'At workshop'].includes(j.status)).flatMap(j => j.labours.filter(l => !l.done && (l.assigned || []).some(a => a.id === me.id)).map(l => ({ j, l }))) : [];
  const search = () => window.dispatchEvent(new Event('mg:search'));
  return (
    <>
      <div className="qa mt" role="group" aria-label="Quick actions">
        {isSA(me) && <>
          <button type="button" className="qa-b" onClick={() => (db.c.length ? openModal('newJob') : alert('Add a customer first.'))}><Icon name="plus" />New job card</button>
          <button type="button" className="qa-b" onClick={() => goPage('pos')}><Icon name="pos" />New sale</button>
          <button type="button" className="qa-b" onClick={() => openModal('grn')}><Icon name="pur" />Receive parts</button></>}
        {!isSA(me) && <button type="button" className="qa-b" onClick={() => goPage('shop')}><Icon name="shop" />{isTech(me) ? 'My tasks and clocking' : 'Workshop'}</button>}
        <button type="button" className="qa-b" onClick={search}><Icon name="search" />Search everything<kbd>Ctrl K</kbd></button>
      </div>
      {isMgr(me) && <ManagerPanel />}
      {tech && <><h2 className="mt">My tasks now</h2><MyTasks tasks={mine} /></>}
      <div className="g g2 mt">{shown.map(([a, b, to, x]) => <Stat key={a} label={a} value={b} onClick={to && (() => goPage(to.page, to.params))} {...x} />)}</div>
      {!tech && <><h2 className="mt">Latest job cards</h2><JobTable list={db.j.slice(0, 8)} /></>}
      {!tech && <p className="mu mt">Customers: {db.c.length} · Vehicles: {db.v.length} · Job cards: {db.j.length}</p>}
    </>
  );
}

const NO_FILTER = { status: [], overdue: false, waiting: false, approve: false };
const SHORT_STATUS = { 'Back with SA': 'With SA' };
export function JobCards() {
  const { db, me, cust, veh, openModal } = useApp();
  const [q, setQ] = useState(''), [f, setF] = usePersistedState('filter:jobs', NO_FILTER), [sort, setSort] = usePersistedState('sort:jobs', null);
  const day = today(), np = readNavParams('jobs');
  // a dashboard tile that opens this list brings its filter along (once)
  useEffect(() => { if (np) { setF({ ...NO_FILTER, ...np }); setQ(''); } clearNavParams(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const has = j => ({ overdue: isOverdue(j, day), waiting: j.parts.some(p => p.waiting), approve: (j.price_reqs || []).some(r => r.status === 'Requested') });
  const count = key => db.j.filter(j => has(j)[key]).length;
  const match = j => { const h = has(j); return (!f.status.length || f.status.includes(j.status)) && (!f.overdue || h.overdue) && (!f.waiting || h.waiting) && (!f.approve || h.approve); };
  const get = (j, k) => (k === 'cust' ? cust(j.cid).name : k === 'plate' ? veh(j.vid).plate : k === 'status' ? STATUSES.indexOf(j.status) : k === 'due' ? (j.due_date ? String(j.due_date).slice(0, 10) : null) : k === 'total' ? jobTotals(j, db.cfg.vat).total : j[k]);
  const list = sortRows(db.j.filter(j => match(j) && (j.id + cust(j.cid).name + veh(j.vid).plate).toLowerCase().includes(q.toLowerCase())), sort, get);
  const toggle = s => setF(x => ({ ...x, status: x.status.includes(s) ? x.status.filter(y => y !== s) : [...x.status, s] }));
  const flip = k => setF(x => ({ ...x, [k]: !x[k] }));
  const any = f.status.length || f.overdue || f.waiting || f.approve;
  const exportCsv = () => downloadCsv('job-cards.csv', [['Job card', 'Customer', 'Phone', 'Plate', 'Vehicle', 'Status', 'Created', 'Due date', 'Total'],
    ...list.map(j => [j.id, cust(j.cid).name, cust(j.cid).phone, veh(j.vid).plate, vehicleName(veh(j.vid)), STATUS_NAME[j.status] || j.status, String(j.created || '').slice(0, 10), j.due_date ? String(j.due_date).slice(0, 10) : '', jobTotals(j, db.cfg.vat).total])]);
  return (
    <>
      <div className="row mt bar"><input aria-label="Search job cards" placeholder="Search by job card, customer or plate" value={q} onChange={e => setQ(e.target.value)} />{isSA(me) && <Btn onClick={() => (db.c.length ? openModal('newJob') : alert('Add a customer first.'))}>New job card</Btn>}{isSA(me) && <Btn kind="ol" onClick={exportCsv} title="Download the list shown below"><Icon name="download" size={16} /> Export CSV</Btn>}</div>
      <div className="chips mt" role="group" aria-label="Filter job cards">
        {STATUSES.map(s => <button key={s} type="button" className={'chip' + (f.status.includes(s) ? ' on' : '')} aria-pressed={f.status.includes(s)} onClick={() => toggle(s)}>{SHORT_STATUS[s] || s}<i>{db.j.filter(j => j.status === s).length}</i></button>)}
        <button type="button" className={'chip warn' + (f.overdue ? ' on' : '')} aria-pressed={f.overdue} onClick={() => flip('overdue')}>Overdue<i>{count('overdue')}</i></button>
        <button type="button" className={'chip warn' + (f.waiting ? ' on' : '')} aria-pressed={f.waiting} onClick={() => flip('waiting')}>Waiting for parts<i>{count('waiting')}</i></button>
        {isMgr(me) && <button type="button" className={'chip warn' + (f.approve ? ' on' : '')} aria-pressed={f.approve} onClick={() => flip('approve')}>Price approvals<i>{count('approve')}</i></button>}
        {any ? <button type="button" className="lnk small" onClick={() => setF(NO_FILTER)}>Clear filters</button> : null}
      </div>
      <p className="mu small mt" role="status">{list.length} of {db.j.length} job cards{any ? ' (filtered)' : ''}. Filters and sorting are kept on this device.</p>
      <div className="mt"><JobTable list={list} sort={sort} onSort={k => setSort(nextSort(sort, k))} /></div>
    </>
  );
}

export function Workshop() {
  const { db, me, run, say, openModal } = useApp();
  const [sec, setSec] = useState(''), [view, setView] = usePersistedState('view:shop', 'list');
  const canStop = ['WS', 'MGR', 'ADMIN'].includes(me.role);
  const endOfDay = async () => {
    if (!confirm('End of the working day: clock out everybody who is still clocked in?\n\nThe clock-out reason will be "End of work day". Their tasks stay open for tomorrow.')) return;
    const r = await run(() => api('/workshop/end-of-day', 'POST'));
    if (r.ok) say(r.data.closed ? `${r.data.closed} running clock(s) closed.` : 'Nobody was clocked in.');
  };
  const live = db.j.flatMap(j => j.labours.map(l => ({ j, l, a: activeClock(l) })).filter(x => x.a));
  const list = db.j.filter(j => ['Dispatched', 'At workshop'].includes(j.status) && (!sec || j.labours.some(l => l.section === sec)));
  // open tasks on the cards that are with the workshop (a Type A/B/C package counts once) and who they are assigned to
  const openTasks = db.j.filter(j => ['Dispatched', 'At workshop'].includes(j.status)).flatMap(j => j.labours.filter(l => !l.done && (!l.svc || j.labours.find(x => x.svc === l.svc) === l)).map(l => ({ j, l })));
  const isMine = (l, id) => (l.assigned || []).some(a => a.id === id), free = openTasks.filter(({ l }) => !(l.assigned || []).length);
  const taskLinks = tasks => tasks.map(({ j, l }) => <div key={l.id}><button type="button" className="lnk" onClick={e => { e.stopPropagation(); openModal('job', { id: j.id }); }}>{j.id}</button> {l.desc}{activeClock(l) && <> <Pill tone="a">working</Pill></>}</div>);
  const mine = openTasks.filter(({ l }) => isMine(l, me.id));
  const views = (
    <div className="row mt"><div className="seg" role="group" aria-label="View">
      <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" size={16} />List</button>
      <button type="button" className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => setView('board')}><Icon name="board" size={16} />Board</button></div>
      {view === 'board' && <span className="mu small">Every job card in the column of its stage. Red: overdue · amber: due today · flag: urgent.</span>}</div>
  );
  if (view === 'board') return <>{views}<div className="mt"><WorkshopBoard jobs={db.j} /></div></>;
  return (
    <>
      {views}
      <div className="row mt"><Field label="Section"><select value={sec} onChange={e => setSec(e.target.value)}><option value="">All sections</option>{SECTIONS.map(s => <option key={s}>{s}</option>)}</select></Field></div>
      <div className="row mt"><h2 style={{ margin: 0 }}>Clocked in now</h2>{canStop && live.length > 0 && <Btn kind="ol" onClick={endOfDay}>End of working day: clock everybody out</Btn>}{db.cfg.workEnd && <span className="mu small">Clocks still running at {db.cfg.workEnd} close by themselves.</span>}</div>
      <Table head={['Technician', 'Work', 'Job card', 'Since']} empty={!live.length && 'Nobody is clocked in.'}>
        {live.map(({ j, l, a }) => <tr key={l.id} className="k" onClick={() => openModal('job', { id: j.id })}><td>{a.tech}</td><td>{l.desc}</td><td>{j.id}</td><td>{dt(a.in)}</td></tr>)}
      </Table>
      {isTech(me)
        ? <>
          <h2 className="mt">My tasks</h2>
          <Table head={['Work', 'Job card', 'Status']} empty={!mine.length && 'No task is assigned to you now.'}>
            {mine.map(({ j, l }) => <tr key={l.id} className="k" onClick={() => openModal('job', { id: j.id })}><td>{l.desc}{activeClock(l)?.tech === me.name && <> <Pill tone="a">you are clocked in</Pill></>}</td><td>{j.id}</td><td>{j.status === 'At workshop' ? 'Ready to start' : 'Waiting to be received'}</td></tr>)}
          </Table>
          {free.length > 0 && <p className="mu small">{free.length} more open task{free.length === 1 ? '' : 's'} {free.length === 1 ? 'has' : 'have'} no technician yet: open the job card to take {free.length === 1 ? 'it' : 'them'} if the supervisor says so.</p>}
        </>
        : <>
          <h2 className="mt">Tasks by technician</h2>
          <Table head={['Technician', 'Open tasks', 'Count']} empty={!(db.techs || []).length && 'No technician accounts yet. The administrator adds them under Staff.'}>
            {[...(db.techs || []).map(t => ({ key: t.id, name: t.name, tasks: openTasks.filter(({ l }) => isMine(l, t.id)) })), ...(free.length ? [{ key: '_free', name: 'Nobody yet', tasks: free }] : [])].map(r => <tr key={r.key}><td><b>{r.name}</b></td><td>{r.tasks.length ? taskLinks(r.tasks) : <span className="mu">Free</span>}</td><td>{r.tasks.length}</td></tr>)}
          </Table>
          {canStop && free.length > 0 && <p className="mu small">Open a job card and use <b>Assign</b> on a task (or the box above its labour list) to choose its technicians.</p>}
        </>}
      <h2 className="mt">Job cards for the workshop</h2>
      <div className="mt"><JobTable list={list} /></div>
    </>
  );
}

export function Proformas() {
  const { db, me, cust, veh, openModal } = useApp();
  const [q, setQ] = useState('');
  const who = p => (p.cid ? cust(p.cid).name : p.guest_name) || '', plate = p => (p.vid ? veh(p.vid).plate : p.guest_plate) || '';
  const list = db.pr.filter(p => (p.id + who(p) + plate(p) + p.estimator).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row mt"><input aria-label="Search proformas" placeholder="Search by number, customer, plate or estimator" value={q} onChange={x => setQ(x.target.value)} />{isSA(me) && <Btn onClick={() => openModal('newProforma')}>New proforma</Btn>}</div>
      <div className="mt"><Table head={['Estimation no', 'Date', 'Customer', 'Vehicle', 'Insurance', 'Estimator', 'Status', { t: 'Total', r: 1 }]} empty={!list.length && 'No proformas yet.'}>
        {list.map(p => (
          <tr key={p.id} className="k" tabIndex={0} onClick={() => openModal('proforma', { id: p.id })} onKeyDown={x => x.key === 'Enter' && openModal('proforma', { id: p.id })}>
            <td><b>{p.id}</b></td><td>{p.pdate}</td><td>{who(p) || <span className="mu">-</span>}{!p.cid && <> <Pill tone="a">not registered</Pill></>}</td><td>{plate(p)}</td><td>{db.ins.find(i => i.id === p.insurer_id)?.name || <span className="mu">customer pays</span>}</td>
            <td>{p.estimator}</td><td><Pill tone={p.status === 'Draft' ? 'a' : 'g'}>{p.status === 'Converted' ? (p.job ? `→ ${p.job}` : 'Job card removed') : p.status === 'Issued' ? 'Finalized' : p.status}</Pill></td><td className="r">{money(tot(p, db.cfg.vat).total)}</td>
          </tr>
        ))}
      </Table></div>
    </>
  );
}

export function Insurance() {
  const { db, me, run, openModal } = useApp();
  const sa = isSA(me);
  const [f, bind, , reset] = usePersistedForm('form:new-insurer', { name: '', phone: '', address: '' });
  const add = async () => { if (!f.name.trim()) return alert('Enter the company name.'); const r = await run(() => api('/insurers', 'POST', f)); if (r.ok) reset(); };
  // Excel: the first row holds the headers. Company name = "Insurance company" / "Company" / "Name"; phone = "Telephone" / "Phone"; address = "Address" / "Location". Companies already in the list are skipped.
  const importFile = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    let rows;
    try { rows = rowsToObjects(await readXlsx(await file.arrayBuffer())); } catch (x) { return alert(x.message || 'This file could not be read. Use an .xlsx file.'); }
    const pick = (r, names) => { const k = Object.keys(r).find(h => names.some(n => h.toLowerCase().includes(n))); return k ? String(r[k]).trim() : ''; };
    const list = rows.map(r => ({ name: pick(r, ['insurance company', 'company', 'name']), phone: pick(r, ['telephone', 'phone', 'tel']), address: pick(r, ['address', 'location']) })).filter(r => r.name);
    if (!list.length) return alert('No company found. The first row must have a column named "Insurance company" (or Company / Name) and optionally "Telephone".');
    const r = await run(() => api('/insurers/import', 'POST', { rows: list }));
    if (r.ok) alert(`${r.data.added} company(ies) added, ${r.data.skipped} already in the list.`);
  };
  return (
    <>
      {sa && <div className="box mt"><h3>New insurance company</h3><div className="row"><Field label="Company name" grow="3 1 200px" {...bind('name')} /><Field label="Phone" {...bind('phone')} /><Field label="Address (printed on proformas)" grow="3 1 200px" {...bind('address')} /><Btn onClick={add}>Save company</Btn></div>
        <div className="row mt"><label className="btn ol" style={{ cursor: 'pointer' }}>Import from Excel<input type="file" accept=".xlsx" hidden onChange={importFile} /></label><span className="mu small">First row = headers: "Insurance company", "Telephone" and (optional) "Address". Companies already in the list are skipped.</span></div></div>}
      <div className="mt"><Table head={['Company', 'Phone', 'Address', 'Customers', '']} empty={!db.ins.length && 'No insurance companies yet.'}>
        {db.ins.map(i => <tr key={i.id}><td><b>{i.name}</b></td><td>{i.phone}</td><td>{i.address}</td><td>{db.c.filter(c => c.insurer_id === i.id).length}</td><td className="acts">{sa && <Btn kind="ol" onClick={() => openModal('insurer', { id: i.id })}>Edit</Btn>}</td></tr>)}
      </Table></div>
    </>
  );
}

export function LabourList() {
  const { db, me, run, openModal } = useApp();
  const sa = isSA(me), rates = db.cfg.labourRates || { default: db.cfg.labourRate }, [q, setQ] = useState('');
  const [f, bind, , reset] = usePersistedForm('form:new-task', { code: '', model_grp: '', task: '', name: '', section: SECTIONS[1], hours: '', price: '' });
  const add = async () => {
    if (!f.name.trim()) return alert('Describe the task.');
    const r = await run(() => api('/labour-tasks', 'POST', { code: f.code, model_grp: f.model_grp, task: f.task, name: f.name, section: f.section, hours: parseFloat(f.hours) || 0, price: parseFloat(f.price) || 0 }));
    if (r.ok) reset();
  };
  const list = db.lt.filter(t => ((t.code || '') + ' ' + (t.model_grp || '') + ' ' + (t.task || '') + ' ' + t.name + ' ' + SECTION_CODE[t.section]).toLowerCase().includes(q.toLowerCase()));
  const groups = groupTasks(list), single = list.filter(t => !t.task), [open, setOpen] = useState({}), [res, setRes] = useState(null);
  const rowCost = t => t.price || Math.round(t.hours * rateOf(rates, t.section, t.model_grp) * 100) / 100;
  const template = () => downloadXlsx('labour-list-template.xlsx', [['Labour Code', 'Labour Type Description', 'Model Grp', 'Hours Required'],
    ['BP-BR101A', 'Apron, Repair - One Side', 'Suzuki', 2], ['ME-BR101', 'ABS System, Diagnosis', 'Suzuki', 5.25]], 'Labour list');
  const importFile = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    let rows;
    try { rows = await readXlsx(await file.arrayBuffer(), true); } catch (x) { return alert(x.message || 'This file could not be read. Use an .xlsx file.'); }   // every sheet
    // keep only the four columns that are used (code, description, model group, hours); the same line on several sheets is sent once
    const seen = new Set(), send = [];
    for (const r of rows) {
      const c = r.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 4), k = c.join('|').toLowerCase();
      if (c.length < 3 || seen.has(k)) continue;
      seen.add(k); send.push(c);
    }
    if (!send.length) return alert('No labour rows were found. The first columns must be: Labour Code, Labour Type Description, Model Grp, Hours Required.');
    // sent in batches so a big price book never hits the server's size or row limit; the results are added together
    const r = await run(async () => {
      const sum = { added: 0, updated: 0, skipped: [], ignored: { sv: 0, other: 0, duplicate: 0 } };
      for (let i = 0; i < send.length; i += 2000) {
        const d = await api('/labour-tasks/import', 'POST', { rows: send.slice(i, i + 2000) });
        sum.added += d.added; sum.updated += d.updated; sum.skipped.push(...(d.skipped || []));
        for (const k of Object.keys(sum.ignored)) sum.ignored[k] += d.ignored?.[k] || 0;
      }
      return sum;
    });
    if (r.ok) setRes(r.data);
  };
  const total = labourSummary(labourRows(db.lt, rates));
  return (
    <>
      <div className="box"><div className="row"><h3 style={{ flex: 1, margin: 0 }}>Total labour registered</h3>
        <Btn kind="ol" disabled={!db.lt.length} onClick={() => downloadLabourPdf(db.lt, rates)}>Download PDF</Btn><Btn kind="ol" disabled={!db.lt.length} onClick={() => downloadLabourXlsx(db.lt, rates)}>Download Excel</Btn></div>
        <div className="g g2 mt"><Stat label="Labour lines registered" value={total.count} small /><Stat label="Total hours" value={total.hours} small />
          {total.bySection.map(x => <Stat key={x.section} label={`${x.code} · ${x.section}`} value={x.count} small />)}<Stat label={`Total cost (${cur()})`} value={money(total.cost)} small /></div>
        <p className="mu small">The PDF and Excel files list every registered labour line (not only the search result below): section, code, task, model group, hours and total cost.</p></div>
      {isMgr(me) && <RatesBox rates={rates} />}
      {sa && <div className="box mt"><h3>New labour task</h3><div className="row">
        <Field label="Labour code" {...bind('code')} /><Field label="Model group" {...bind('model_grp')} /><Field label="Task (group, optional)" grow="2 1 180px" {...bind('task')} /><Field label="Labour line" grow="3 1 200px" {...bind('name')} /><Field label="Section"><select {...bind('section')}>{SECTIONS.map(s => <option key={s} value={s}>{sectionOption(s)}</option>)}</select></Field>
        <Field label="Hours" type="number" min="0" step="0.25" {...bind('hours')} /><Field label={`Total cost (${cur()}), empty = hours x rate`} type="number" min="0" {...bind('price')} /><Btn onClick={add}>Save task</Btn>
      </div></div>}
      {sa && <div className="box mt"><h3>Import from Excel</h3>
        <p className="mu small">Choose the price-book Excel file (all its sheets are read). Only these are taken: Labour Code · Labour Type Description · Model Grp · Hours Required. The section comes from the code: BP- → Body &amp; Paints, ME- → Mechanical Repairs. SV- codes are not imported (they are in the Service types: choose Type A or B on the job card). The cost is not read from the file: it is always hours × the labour rate above. Existing lines are updated, nothing is deleted.</p>
        <div className="row"><label className="b ol" style={{ cursor: 'pointer' }}>Choose Excel file<input type="file" accept=".xlsx" hidden onChange={importFile} /></label><Btn kind="ol" onClick={template}>Download the template</Btn></div>
        {res && <p className="mt"><b>{res.added}</b> added · <b>{res.updated}</b> updated{res.ignored && <span className="mu small"> · not imported: {res.ignored.sv} SV · {res.ignored.other} other codes · {res.ignored.duplicate} repeated on other sheets</span>}{res.skipped.length ? <> · <b>{res.skipped.length}</b> skipped: {res.skipped.slice(0, 8).map(x => `${x.code} (${x.why})`).join('; ')}{res.skipped.length > 8 ? '…' : ''}</> : ''}</p>}
      </div>}
      <div className="mt"><input aria-label="Search tasks" placeholder="Search tasks or BP / ME" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="mt"><Table head={['Section', 'Task / labour line', { t: 'Hours', r: 1 }, { t: `Total cost (${cur()})`, r: 1 }, '']} empty={!list.length && 'No labour tasks yet.'}>
        {SECTIONS.flatMap(sec => {
          const gs = groups.filter(g => g.items.some(t => t.section === sec)), ss = single.filter(t => t.section === sec);
          if (!gs.length && !ss.length) return [];
          return [<tr key={'h' + sec}><td colSpan={5}><b>{SECTION_CODE[sec]}</b> <span className="mu small">{sec}</span></td></tr>,
            ...gs.flatMap(g => { const items = g.items.filter(t => t.section === sec), o = open[g.name] || !!q;
              return [<tr key={sec + g.name}><td /><td><button type="button" className="lnk" onClick={() => setOpen(x => ({ ...x, [g.name]: !x[g.name] }))}>{o ? '▾' : '▸'} <b>{g.name}</b></button> <span className="mu small">{items.length} line{items.length === 1 ? '' : 's'}</span></td><td className="r">{groupHours({ items })}</td><td className="r"><b>{money(groupCost({ items }, rates))}</b></td><td /></tr>,
                ...(o ? items.map(t => <tr key={t.id}><td /><td style={{ paddingLeft: 28 }}>{t.name}</td><td className="r">{t.hours}</td><td className="r">{money(rowCost(t))}{!t.price && <span className="mu small"> ({t.hours} x {rateOf(rates, t.section, t.model_grp)})</span>}</td><td className="acts">{sa && <Btn kind="ol" onClick={() => openModal('labourTask', { id: t.id })}>Edit</Btn>}</td></tr>) : [])]; }),
            ...ss.map(t => <tr key={t.id}><td /><td>{t.name}{t.code && <span className="mu small"> · {t.code}{t.model_grp ? ' · ' + t.model_grp : ''}</span>}</td><td className="r">{t.hours}</td><td className="r">{money(rowCost(t))}{!t.price && <span className="mu small"> ({t.hours} x {rateOf(rates, t.section, t.model_grp)})</span>}</td><td className="acts">{sa && <Btn kind="ol" onClick={() => openModal('labourTask', { id: t.id })}>Edit</Btn>}</td></tr>)];
        })}
      </Table></div>
    </>
  );
}

// The manager sets the labour rate (ETB per hour) of each section; an empty box uses the standard rate.
function RatesBox({ rates }) {
  const { run, say } = useApp();
  const init = () => ({ ...Object.fromEntries(SECTIONS.map(s => [s, rates[s] !== undefined && rates[s] !== rates.default ? String(rates[s]) : ''])), ...Object.fromEntries(MAKES.map(m => [m, String(rates[m] ?? '')])) });
  const [f, setF] = useState(init);
  const save = async () => { const r = await run(() => api('/settings/labour-rates', 'PUT', { rates: f })); if (r.ok) say('Labour rates saved. They apply to labour added from now on.'); };
  const box = (k, label, ph) => <Field key={k} label={label} type="number" min="0" step="any" placeholder={ph} value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} />;
  return (
    <div className="box mt"><h3>Labour rate per hour ({cur()})</h3>
      <div className="mu small">By make: the Model Grp of a price-book line decides its rate (Toyota covers every "Toyota ..." group; any other group is Others). Hours x this rate fills the labour cost; the price can still be typed over.</div>
      <div className="row">
        {MAKES.map(m => box(m, m, String(DEFAULT_MAKE_RATE[m])))}
        <Btn onClick={save}>Save rates</Btn>
      </div>
      <div className="mu small mt">For work with no make (typed by hand), the rate of its section is used; an empty box uses the standard rate ({rates.default} {cur()}/h).</div>
      <div className="row">{SECTIONS.map(s => box(s, `${SECTION_CODE[s]} · ${s}`, String(rates.default)))}</div>
    </div>
  );
}

export function Estimates() {
  const { db, me, run, cust, veh, openModal } = useApp();
  const delEst = async e => { if (confirm(`Delete estimate ${e.id}?`)) await run(() => api('/estimates/' + e.id, 'DELETE')); };
  const [q, setQ] = useState('');
  const list = db.e.filter(e => (e.id + cust(e.cid).name + veh(e.vid).plate + e.note).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row mt"><input aria-label="Search estimates" placeholder="Search by estimate number, customer or plate" value={q} onChange={x => setQ(x.target.value)} />{isSA(me) && <Btn onClick={() => openModal('newEstimate')}>New estimate</Btn>}</div>
      <div className="mt"><Table head={['Estimate', 'Customer', 'Vehicle', 'Status', 'Loaded on', { t: 'Total', r: 1 }, '']} empty={!list.length && 'No estimates yet.'}>
        {list.map(e => (
          <tr key={e.id} className="k" tabIndex={0} onClick={() => openModal('estimate', { id: e.id })} onKeyDown={x => x.key === 'Enter' && openModal('estimate', { id: e.id })}>
            <td><b>{e.id}</b></td><td>{e.cid ? cust(e.cid).name : <span className="mu">no customer yet</span>}</td><td>{veh(e.vid).plate} {vehicleName(veh(e.vid))}</td>
            <td><Pill tone={e.status === 'Finalized' ? 'g' : 'a'}>{e.status}</Pill></td><td>{e.used_in || <span className="mu">not yet</span>}</td><td className="r">{money(tot(e, db.cfg.vat).total)}</td>
            <td className="acts" onClick={x => x.stopPropagation()}>{isAdmin(me) && !e.used_in && <Btn kind="ol" onClick={() => delEst(e)}>Delete</Btn>}</td>
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
  const delCustomer = async c => { if (confirm(`Delete customer ${c.name} (${c.id}) with ALL his vehicles, job cards, estimates and proformas?\nParts issued on his job cards go back to stock. This cannot be undone.`)) await run(() => api('/customers/' + c.id, 'DELETE')); };
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
            <td className="acts">{sa && <><Btn kind="ol" onClick={() => openModal('customer', { id: c.id })}>Edit</Btn><Btn kind="ol" onClick={() => openModal('vehicle', { cid: c.id })}>Add vehicle</Btn><Btn kind="ol" onClick={() => openModal('telegram', { id: c.id })}>Telegram link</Btn></>}{isAdmin(me) && <Btn kind="ol" onClick={() => delCustomer(c)}>Delete</Btn>}</td>
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
        <div className="row mt"><h2 style={{ flex: 1 }}>Revenue</h2><Btn kind="ol" onClick={() => downloadCsv(`revenue_${range.from}_${range.to}.csv`, [['Date', 'Invoice', 'Job card', 'Customer', 'Plate', 'Type', 'Labour', 'Parts', 'VAT', `Total (${cur()})`]].concat(rev.invoices.map(x => [dt(x.date), x.no, x.jc, x.customer, x.plate, x.type, x.labour, x.parts, x.vat, x.total])))}>Download CSV</Btn></div>
        <div className="g g2 mt">{[['Invoices', rev.sum.count], ['Cash invoices', money(rev.sum.cash)], ['Credit invoices (to collect)', money(rev.sum.credit)], [`Total incl. VAT (${cur()})`, money(rev.sum.total)]].map(([a, b]) => <Stat key={a} label={a} value={b} small />)}</div>
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

// A password box with a Show / Hide button
function PasswordBox({ label, value, onChange, autoComplete = 'new-password' }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label>{label}
        <span style={{ display: 'flex', gap: 6 }}>
          <input type={shown ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} style={{ flex: 1 }} />
          <Btn kind="ol" onClick={() => setShown(v => !v)}>{shown ? 'Hide' : 'Show'}</Btn>
        </span>
      </label>
    </div>
  );
}

// The Manager reads a person's password (for someone who forgot it): fetched only when he presses Show, never kept in the list
function SeePassword({ id }) {
  const [pw, setPw] = useState(null), [busy, setBusy] = useState(false);   // pw: null = hidden, string = shown, false = none stored
  const toggle = async () => {
    if (pw !== null) return setPw(null);
    setBusy(true);
    try { const d = await api(`/users/${id}/password`); setPw(d.password ?? false); } catch (e) { alert(e.message); }
    setBusy(false);
  };
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
    <code>{pw === null ? '••••••••' : pw === false ? 'not saved yet' : pw}</code>
    <Btn kind="ol" onClick={toggle} disabled={busy}>{pw === null ? 'Show' : 'Hide'}</Btn>
  </span>;
}

export function Staff() {
  const { users, me, run } = useApp();
  const [f, bind, , reset] = usePersistedForm('form:new-staff', { name: '', username: '', password: '', role: 'SA' });
  const [ed, setEd] = useState(null);   // { id, mode: 'edit' | 'pass', name, username, role, password }
  // the Administrator gives any role; the Manager gives every role except Administrator
  const roles = Object.entries(ROLES).filter(([k]) => isAdmin(me) || k !== 'ADMIN');
  const add = async () => { const r = await run(() => api('/users', 'POST', f)); if (r.ok) reset(); };
  const save = async () => {
    const body = ed.mode === 'pass' ? { password: ed.password } : { name: ed.name, username: ed.username, role: ed.role, ...(ed.password ? { password: ed.password } : {}) };
    if (ed.mode === 'pass' && !ed.password) return alert('Write the new password.');
    const r = await run(() => api('/users/' + ed.id, 'PUT', body));
    if (r.ok) setEd(null);
  };
  const del = async u => { if (confirm(`Delete the account of ${u.name} (${u.username})?\nHe will not be able to sign in again. This cannot be undone.`)) await run(() => api('/users/' + u.id, 'DELETE')); };
  const set = p => setEd(e => ({ ...e, ...p }));
  const reset2fa = async u => { if (confirm(`${t('Reset two-step')}: ${u.name}?`)) await run(() => api('/users/' + u.id, 'PUT', { reset2fa: true })); };
  return (
    <>
      <TwoFactor />
      <CurrencyBox />
      <div className="box mt"><h3>New staff account</h3><div className="row">
        <Field label="Full name" {...bind('name')} /><Field label="Username" autoComplete="off" {...bind('username')} />
        <PasswordBox label="Password (8+ characters)" {...bind('password')} />
        <Field label="Role"><select {...bind('role')}>{roles.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field><Btn onClick={add}>Create account</Btn>
      </div></div>
      {ed && <div className="box mt"><h3>{ed.mode === 'pass' ? `New password for ${ed.name}` : `Edit ${ed.name}`}</h3><div className="row">
        {ed.mode === 'edit' && <>
          <Field label="Full name" value={ed.name} onChange={e => set({ name: e.target.value })} />
          <Field label="Username" autoComplete="off" value={ed.username} onChange={e => set({ username: e.target.value })} />
          <Field label="Role"><select value={ed.role} disabled={ed.id === me.id} onChange={e => set({ role: e.target.value })}>{roles.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
        </>}
        <PasswordBox label={ed.mode === 'pass' ? 'New password (8+ characters)' : 'New password (leave empty to keep)'} value={ed.password} onChange={e => set({ password: e.target.value })} />
        <Btn onClick={save}>Save</Btn><Btn kind="ol" onClick={() => setEd(null)}>Cancel</Btn>
      </div><p className="mu small">After a change, the person signs in again with the new details.</p></div>}
      <p className="mu small mt">Press <b>Show</b> to read a password and <b>Change password</b> to set a new one for someone who forgot it. Every look is written to the audit trail. A password shows as “not saved yet” until that person signs in once or you set a new one.</p>
      <div className="mt"><Table head={['Name', 'Username', 'Password', 'Role', '']}>{users.map(u => <tr key={u.id}><td>{u.name}{u.id === me.id && <span className="mu small"> (you)</span>}</td><td>{u.username}</td><td><SeePassword id={u.id} /></td><td>{ROLES[u.role]}</td>
        <td className="acts"><Btn kind="ol" onClick={() => setEd({ id: u.id, mode: 'edit', name: u.name, username: u.username, role: u.role, password: '' })}>Edit</Btn>
          <Btn kind="ol" onClick={() => setEd({ id: u.id, mode: 'pass', name: u.name, username: u.username, role: u.role, password: '' })}>Change password</Btn>
          {u.tfa && <Btn kind="ol" onClick={() => reset2fa(u)}>{t('Reset two-step')}</Btn>}
          {u.id !== me.id && <Btn kind="ol" onClick={() => del(u)}>Delete</Btn>}</td></tr>)}</Table></div>
    </>
  );
}
