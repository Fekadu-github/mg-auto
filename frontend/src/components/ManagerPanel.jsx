import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Stat, Table } from './ui.jsx';
import Spark from './Spark.jsx';
import { clockedIn } from '../lib/insight.js';
import { activeClock, dt, money } from '../lib/format.js';

// The manager's part of the dashboard: cash collected today, unpaid invoices by age, who is clocked in on which job, sales over 7 and 30 days.
export default function ManagerPanel() {
  const { db, goPage, openModal } = useApp();
  const [d, setD] = useState(null), [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api('/insight/manager').then(x => { if (live) { setD(x); setErr(''); } }).catch(e => live && setErr(e.message));
    load(); const t = setInterval(() => document.visibilityState === 'visible' && load(), 60000);
    return () => { live = false; clearInterval(t); };
  }, []);
  const live = clockedIn(db.j, activeClock), owed = d ? d.unpaid.reduce((a, b) => a + b.amount, 0) : 0;
  return (
    <>
      <h2 className="mt">Manager view</h2>
      {err && <p role="alert" style={{ color: 'var(--rd)' }}>{err}</p>}
      <div className="g g2 mt">
        <Stat label="Cash collected today" value={d ? money(d.collected.total) : '…'} icon="cash" tone="g" onClick={() => goPage('invc')} />
        <Stat label="Unpaid credit invoices" value={d ? money(owed) : '…'} icon="receipt" tone="a" onClick={() => goPage('invc')} />
        <div className="box stat-card"><div className="stat" style={{ fontSize: 30 }}>{d ? money(d.total7) : '…'}</div><div className="stat-l">Sales, last 7 days</div>{d && <Spark values={d.sales7.map(x => x.total)} label="Sales per day, last 7 days" />}</div>
        <div className="box stat-card"><div className="stat" style={{ fontSize: 30 }}>{d ? money(d.total30) : '…'}</div><div className="stat-l">Sales, last 30 days</div>{d && <Spark values={d.sales30.map(x => x.total)} label="Sales per day, last 30 days" />}</div>
      </div>
      {d && d.collected.total > 0 && <p className="mu small">Today: {money(d.collected.cashSales)} cash sales + {money(d.collected.payments)} paid on credit invoices.</p>}
      <div className="g g2 mt" style={{ alignItems: 'start' }}>
        <div><h3>Unpaid invoices by age</h3>
          <Table head={['Age (days)', { t: 'Invoices', r: 1 }, { t: 'Owed', r: 1 }]} empty={d && !owed && 'No unpaid credit invoices.'}>
            {d && owed > 0 && d.unpaid.map(b => <tr key={b.label} className={'k' + (b.label === '90+' && b.count ? ' late' : '')} tabIndex={0} onClick={() => goPage('invc')} onKeyDown={e => e.key === 'Enter' && goPage('invc')}><td>{b.label}</td><td className="r">{b.count}</td><td className="r">{money(b.amount)}</td></tr>)}
          </Table></div>
        <div><h3>Clocked in now</h3>
          <Table head={['Technician', 'Job card', 'Since']} empty={!live.length && 'Nobody is clocked in.'}>
            {live.map(r => <tr key={r.job + r.tech + r.since} className="k" tabIndex={0} onClick={() => openModal('job', { id: r.job })} onKeyDown={e => e.key === 'Enter' && openModal('job', { id: r.job })}><td>{r.tech}</td><td>{r.job}<span className="mu small"> · {r.work}</span></td><td>{dt(r.since)}</td></tr>)}
          </Table></div>
      </div>
    </>
  );
}
