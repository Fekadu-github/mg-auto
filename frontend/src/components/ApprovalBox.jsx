import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Pill } from './ui.jsx';
import { t } from '../lib/i18n.js';
import { dt } from '../lib/format.js';

// Customer approval by link, shown on an estimate or a proforma. The link carries a frozen copy of the document.
export default function ApprovalBox({ kind, id, ready = true }) {
  const { run, say } = useApp();
  const [list, setList] = useState(null);
  const load = useCallback(() => api(`/approvals?kind=${kind}&ref=${encodeURIComponent(id)}`).then(setList).catch(() => setList([])), [kind, id]);
  useEffect(() => { load(); }, [load]);
  if (list === null) return null;
  const cur = list[0], link = tk => `${location.origin}/#/approve/${tk}`;
  const make = async () => { const r = await run(() => api('/approvals', 'POST', { kind, ref: id })); if (r.ok) load(); };
  const withdraw = async () => { const r = await run(() => api('/approvals/' + cur.token, 'DELETE')); if (r.ok) load(); };
  const copy = async url => { try { await navigator.clipboard.writeText(url); say(t('Copied')); } catch { prompt('', url); } };
  const pending = cur?.status === 'Pending' && new Date(cur.expires) > new Date(), url = cur && link(cur.token);
  const msg = encodeURIComponent(`${t('Please check the estimate')} ${id}: `);
  return (
    <div className="box mt">
      <h3>{t('Customer approval')} {cur && <Pill tone={cur.status === 'Approved' ? 'g' : cur.status === 'Pending' ? 'a' : ''}>{cur.status === 'Revoked' ? t('Replaced by a newer link') : cur.status === 'Pending' && !pending ? t('Expired') : t(cur.status)}</Pill>}</h3>
      {!cur && <p className="mu small">{t('No approval link yet.')}</p>}
      {cur && (cur.status === 'Approved' || cur.status === 'Declined') && <p>{cur.status === 'Approved' ? t('Approved by') : t('Declined by')} <b>{cur.decided_name}</b> · {dt(cur.decided_at)}{cur.decided_note ? ` · “${cur.decided_note}”` : ''}</p>}
      {pending && <>
        <p className="mu small">{t('Waiting for the customer')}</p>
        <div className="box" style={{ wordBreak: 'break-all' }}>{url}</div>
        <div className="row mt"><Btn onClick={() => copy(url)}>{t('Copy')}</Btn><a className="b ol" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${msg}`} target="_blank" rel="noreferrer">{t('Send by Telegram')}</a><a className="b ol" href={`sms:?&body=${msg}${encodeURIComponent(url)}`}>{t('Send by SMS')}</a><Btn kind="ol" onClick={withdraw}>{t('Withdraw link')}</Btn></div>
      </>}
      <div className="row mt"><Btn kind={pending ? 'ol' : ''} onClick={make} disabled={!ready}>{pending || (cur && cur.status !== 'Pending') ? t('Make a new link') : t('Make approval link')}</Btn></div>
      <p className="mu small">{t('The customer opens the link on his phone, sees exactly what is on this document, and approves or declines it. The link works for 14 days. If you change the document, make a new link.')}</p>
    </div>
  );
}
