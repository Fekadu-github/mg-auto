import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { t } from '../lib/i18n.js';
import { money, setCurrency, cur } from '../lib/format.js';
import LangToggle from '../components/LangToggle.jsx';

// The customer's page, opened from the link (no sign-in): shows the frozen estimate and takes his decision
export default function Approve({ token }) {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [name, setName] = useState(''), [note, setNote] = useState(''), [done, setDone] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api('/public/approval/' + token).then(x => { setCurrency(x.currency); setD(x); }).catch(e => setErr(e.message)); }, [token]);
  const decide = async decision => {
    setBusy(true); setErr('');
    try { const r = await api('/public/approval/' + token, 'POST', { decision, name, note }); setDone(r.status); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const wrap = { maxWidth: 720, margin: '0 auto', padding: 16, fontFamily: 'system-ui, "Noto Sans Ethiopic", sans-serif' };
  if (err && !d) return <div style={wrap}><p role="alert">{err === 'This link is not valid' ? t('This link is not valid.') : err}</p></div>;
  if (!d) return <div style={wrap}><p>{t('Loading…')}</p></div>;
  const x = d.doc, g = d.garage || {}, pending = d.status === 'Pending';
  const th = { textAlign: 'left', borderBottom: '1px solid #8884', padding: '6px 4px' }, tdr = { textAlign: 'right', padding: '6px 4px' }, td = { padding: '6px 4px' };
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><b style={{ fontSize: 20 }}>{g.name || 'MADEG General Trading PLC'}</b>{(g.brand || !g.name) && <><br /><b>{g.brand || 'MG Auto'}</b></>}<br /><span style={{ opacity: .7 }}>{[g.address, g.phone].filter(Boolean).join(' · ')}</span></div><LangToggle /></div>
      <h2>{t('Please check the estimate')} {x.no}</h2>
      <p>{x.customer && <><b>{x.customer}</b> · </>}{x.plate && <b>{x.plate}</b>} {x.vehicle && `· ${x.vehicle}`}<br /><span style={{ opacity: .7 }}>{x.note}</span></p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>{t('Description')}</th><th style={{ ...th, textAlign: 'right' }}>{t('Qty')}</th><th style={{ ...th, textAlign: 'right' }}>{t('Amount')} ({cur()})</th></tr></thead>
          <tbody>
            {x.labours.map((l, i) => <tr key={'l' + i}><td style={td}>{l.desc} <small style={{ opacity: .6 }}>· {t('Labour')}</small></td><td style={tdr}>1</td><td style={tdr}>{money(l.price)}</td></tr>)}
            {x.parts.map((p, i) => <tr key={'p' + i}><td style={td}>{p.name}</td><td style={tdr}>{p.qty}</td><td style={tdr}>{money(p.qty * p.price)}</td></tr>)}
          </tbody>
          <tfoot>
            <tr><td style={td} colSpan={2}>{t('Subtotal')}</td><td style={tdr}>{money(x.totals.sub)}</td></tr>
            <tr><td style={td} colSpan={2}>{t('VAT')} {Math.round(x.totals.rate * 1000) / 10}%</td><td style={tdr}>{money(x.totals.vat)}</td></tr>
            <tr><td style={{ ...td, fontWeight: 700 }} colSpan={2}>{t('Total')} ({cur()})</td><td style={{ ...tdr, fontWeight: 700, fontSize: 18 }}>{money(x.totals.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      {x.terms && <p style={{ opacity: .75, fontSize: 14 }}><b>{t('Terms and conditions')}:</b> {x.terms}</p>}
      <hr />
      {done ? <p role="status" style={{ fontSize: 18 }}><b>{done === 'Approved' ? t('Thank you. Your approval was received. The garage will start the work.') : t('Your answer was received. The garage will contact you.')}</b></p>
        : pending ? <>
          <label style={{ display: 'block', margin: '8px 0' }}>{t('Your name')}<input value={name} onChange={e => setName(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, fontSize: 16 }} autoComplete="name" /></label>
          <label style={{ display: 'block', margin: '8px 0' }}>{t('Comment (optional)')}<input value={note} onChange={e => setNote(e.target.value)} maxLength={300} style={{ display: 'block', width: '100%', padding: 10, fontSize: 16 }} /></label>
          {err && <p role="alert" style={{ color: '#c0392b' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="b" disabled={busy || !name.trim()} onClick={() => decide('approve')} style={{ flex: 1, padding: 14, fontSize: 16 }}>{t('Approve')}</button>
            <button type="button" className="b ol" disabled={busy || !name.trim()} onClick={() => decide('decline')} style={{ flex: 1, padding: 14, fontSize: 16 }}>{t('Decline')}</button>
          </div>
        </> : <p role="status"><b>{d.status === 'Expired' ? t('This link has expired. Ask the garage for a new one.') : d.status === 'Revoked' ? t('Replaced by a newer link') : `${t(d.status)}${d.decided_name ? ` · ${d.decided_name}` : ''}`}</b></p>}
    </div>
  );
}
