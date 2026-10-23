import { useApp } from '../store.jsx';
import { StatusPill } from './ui.jsx';
import Icon from './Icon.jsx';
import { STATUS_NAME } from '../lib/constants.js';
import { boardColumns, isDueToday, isOverdue, isUrgent } from '../lib/jobFlags.js';
import { activeClock, today, vehicleName } from '../lib/format.js';

const CAP = 25;
// Every job card as a card in the column of its stage. Red = overdue, amber = due today, flag = urgent; the technicians clocked in show on the card.
export default function WorkshopBoard({ jobs }) {
  const { openModal, cust, veh, goPage } = useApp();
  const day = today(), cols = boardColumns(jobs, day);
  return (
    <div className="kb" role="list">
      {cols.map(c => (
        <section key={c.status} className="kb-c" role="listitem" aria-label={STATUS_NAME[c.status]}>
          <header><StatusPill status={c.status} /><b>{c.jobs.length}</b></header>
          <div className="kb-l">
            {c.jobs.slice(0, CAP).map(j => {
              const over = isOverdue(j, day), soon = isDueToday(j, day), who = [...new Set(j.labours.map(activeClock).filter(Boolean).map(a => a.tech))], open = j.labours.filter(l => !l.done).length;
              return (
                <button key={j.id} type="button" className={'kb-j' + (over ? ' over' : soon ? ' soon' : '')} onClick={() => openModal('job', { id: j.id })}>
                  <span className="kb-t"><b>{j.id}</b>{isUrgent(j) && <Icon name="flag" size={14} className="kb-f" aria-label="Urgent" />}</span>
                  <span>{cust(j.cid).name}</span>
                  <span className="mu small">{veh(j.vid).plate} {vehicleName(veh(j.vid))}</span>
                  <span className="kb-m small">
                    {j.due_date && <span className={over ? 'kb-o' : soon ? 'kb-s' : 'mu'}><Icon name="calendar" size={12} /> {String(j.due_date).slice(0, 10)}{over ? ' · overdue' : soon ? ' · today' : ''}</span>}
                    {open > 0 && <span className="mu">{open} open task{open === 1 ? '' : 's'}</span>}
                    {who.length > 0 && <span className="kb-w"><Icon name="clock" size={12} /> {who.join(', ')}</span>}
                  </span>
                </button>);
            })}
            {c.jobs.length > CAP && <button type="button" className="lnk small" onClick={() => goPage('jobs', { status: [c.status] })}>+ {c.jobs.length - CAP} more: open the list</button>}
            {!c.jobs.length && <div className="mu small kb-e">Nothing here</div>}
          </div>
        </section>))}
    </div>
  );
}
