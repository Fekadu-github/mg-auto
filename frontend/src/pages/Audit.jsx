// Audit trail for the manager: who did what and when (sign-ins, finalized estimates, deleted records, staff changes, refused attempts).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Btn, Pill, Table } from '../components/ui.jsx';
import { ROLES } from '../lib/constants.js';

export default function Audit() {
  const [rows, setRows] = useState(null), [q, setQ] = useState(''), [err, setErr] = useState('');
  const load = async text => {
    try { setRows(await api('/audit?limit=300' + (text ? '&q=' + encodeURIComponent(text) : ''))); setErr(''); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(''); }, []);
  const when = at => { const d = new Date(String(at).endsWith('Z') ? at : at + 'Z'); return Number.isNaN(+d) ? '' : d.toLocaleString(); };
  return (
    <>
      <form className="row mt" onSubmit={e => { e.preventDefault(); load(q.trim()); }}>
        <input aria-label="Search the audit trail" placeholder="Search a person, an action or a number (EST-…, TC-…)" value={q} onChange={e => setQ(e.target.value)} />
        <Btn type="submit">Search</Btn><Btn kind="ol" onClick={() => { setQ(''); load(''); }}>Latest</Btn>
      </form>
      {err && <p className="mu mt" role="alert">{err}</p>}
      <div className="mt">
        <Table head={['When', 'Person', 'Role', 'Action', 'Record', 'Result']} empty={rows && !rows.length && 'Nothing recorded yet.'}>
          {(rows || []).map(r => (
            <tr key={r.id}>
              <td>{when(r.at)}</td><td>{r.user_name || <span className="mu">-</span>}</td><td>{ROLES[r.role] || r.role}</td><td>{r.action}</td><td>{r.ref}</td>
              <td><Pill tone={r.status < 400 ? 'g' : 'a'}>{r.status < 400 ? 'done' : `refused ${r.status}`}</Pill></td>
            </tr>
          ))}
        </Table>
      </div>
      <p className="mu small mt">Showing the latest 300. The trail keeps the action, the record number and the person, never customer data or passwords, and is kept for about 13 months.</p>
    </>
  );
}
