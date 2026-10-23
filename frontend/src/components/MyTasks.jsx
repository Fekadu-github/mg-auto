import { useApp } from '../store.jsx';
import { Pill } from './ui.jsx';
import Icon from './Icon.jsx';
import { activeClock, vehicleName } from '../lib/format.js';

// The technician's home: his open tasks as big cards. The button opens the job card, where he clocks in or out.
export default function MyTasks({ tasks }) {
  const { me, veh, openModal } = useApp();
  if (!tasks.length) return <div className="box mt"><b>No task is assigned to you now.</b><div className="mu small">When the supervisor assigns you a task it shows here.</div></div>;
  return (
    <div className="mt-list mt" role="list">
      {tasks.map(({ j, l }) => {
        const on = activeClock(l)?.tech === me.name, v = veh(j.vid);
        return (
          <div key={l.id} className={'mt-card' + (on ? ' on' : '')} role="listitem">
            <div className="mt-h"><b>{l.desc}</b>{on && <Pill tone="g">you are clocked in</Pill>}</div>
            <div className="mu">{j.id} · {v.plate} {vehicleName(v)}</div>
            <div className="mu small">{j.status === 'At workshop' ? 'Ready to start' : 'Waiting to be received'}</div>
            <button type="button" className={'b mt-go' + (on ? ' ol' : '')} onClick={() => openModal('job', { id: j.id })}><Icon name="clock" size={20} />{on ? 'Open job card and clock out' : 'Open job card and clock in'}</button>
          </div>);
      })}
    </div>
  );
}
