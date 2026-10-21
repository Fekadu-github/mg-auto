import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field } from './ui.jsx';
import { t } from '../lib/i18n.js';

// Two-step sign-in for the signed-in Manager or Administrator: set up, turn on, turn off
export default function TwoFactor() {
  const { run, say } = useApp();
  const [on, setOn] = useState(null), [setup, setSetup] = useState(null), [code, setCode] = useState(''), [pw, setPw] = useState('');
  useEffect(() => { api('/auth/2fa').then(d => setOn(d.on)).catch(() => setOn(false)); }, []);
  if (on === null) return null;
  const start = async () => { const r = await run(() => api('/auth/2fa/setup', 'POST')); if (r.ok) { setSetup(r.data); setCode(''); } };
  const enable = async () => { const r = await run(() => api('/auth/2fa/enable', 'POST', { code })); if (r.ok) { setOn(true); setSetup(null); setCode(''); say(t('Two-step sign-in') + ': ' + t('On')); } };
  const disable = async () => { const r = await run(() => api('/auth/2fa/disable', 'POST', { password: pw, code })); if (r.ok) { setOn(false); setCode(''); setPw(''); } };
  const grouped = setup?.secret.replace(/(.{4})/g, '$1 ').trim();
  return (
    <div className="box mt">
      <h3>{t('Two-step sign-in')} <span className="pill" style={{ marginLeft: 8 }}>{on ? t('On') : t('Off')}</span></h3>
      {on ? <>
        <p className="mu small">{t('Two-step sign-in is on. Signing in needs your password and a code from your phone.')}</p>
        <div className="row"><Field label={t('Password')} type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /><Field label={t('Code from the app')} inputMode="numeric" maxLength={7} value={code} onChange={e => setCode(e.target.value)} /><Btn kind="ol" onClick={disable} disabled={!pw || !code}>{t('Turn off')}</Btn></div>
      </> : setup ? <>
        <p className="mu small">{t('Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy), add a new account with "Enter a setup key", type the key below, then write the 6-digit code it shows.')}</p>
        <div className="box" style={{ wordBreak: 'break-all' }}>{t('Secret key')}: <b style={{ letterSpacing: 1 }}>{grouped}</b> · <a href={setup.uri}>{t('Open in authenticator app')}</a></div>
        <div className="row mt"><Field label={t('Code from the app')} inputMode="numeric" maxLength={7} value={code} onChange={e => setCode(e.target.value)} /><Btn onClick={enable} disabled={code.replace(/\s/g, '').length !== 6}>{t('Turn on')}</Btn><Btn kind="ol" onClick={() => setSetup(null)}>{t('Cancel')}</Btn></div>
      </> : <>
        <p className="mu small">{t('Turn on two-step sign-in for your account (Staff screen).')}</p>
        <Btn onClick={start}>{t('Set up two-step sign-in')}</Btn>
      </>}
    </div>
  );
}
