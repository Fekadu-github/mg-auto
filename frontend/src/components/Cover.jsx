import { useState } from 'react';
import { useApp } from '../store.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import LangToggle from './LangToggle.jsx';
import { t } from '../lib/i18n.js';

const B = { garage: 'MADEG', system: 'MG Auto', motto: 'Your car, our care', company: 'MADEG Garage · MG Auto', place: 'Gurdshola, around Top Ten Hotel', phone: '0980766566' };

// decorative wireframe, blue to green
function Rosette() {
  return (
    <svg className="gl" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f7bff" /><stop offset="1" stopColor="#5cb72e" /></linearGradient></defs>
      <g fill="none" stroke="url(#gg)" strokeWidth=".8" opacity=".38">{Array.from({ length: 40 }, (_, i) => <ellipse key={i} cx="330" cy="330" rx="360" ry="130" transform={`rotate(${i * 4.5} 330 330)`} />)}</g>
      <g fill="none" stroke="url(#gg)" strokeWidth=".7" opacity=".22">{Array.from({ length: 36 }, (_, i) => <ellipse key={i} cx="640" cy="820" rx="300" ry="95" transform={`rotate(${i * 5} 640 820)`} />)}</g>
    </svg>
  );
}

// Cover and sign-in page
export default function Cover() {
  const { signIn } = useApp();
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [code, setCode] = useState(''), [step2, setStep2] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await signIn(u.trim(), p, step2 ? code.replace(/\s/g, '') : ''); if (r?.need2fa) { setStep2(true); setBusy(false); } } catch (x) { setErr(x.message); setBusy(false); if (step2) setCode(''); }
  };
  return (
    <div className="cv">
      <section className="cv-l">
        <Rosette />
        <img className="cv-logo" src="/madeg-logo.png" alt="MG Auto logo" />
        <h1>{B.garage} <span>Garage</span></h1>
        <div className="sub">{B.system} · Workshop system</div>
        <p>Job cards, workshop clocks, parts stock and invoicing for {B.garage} Garage.</p>
        <ul className="cv-chips" aria-label="What the system does"><li>Job cards</li><li>Workshop clocks</li><li>Parts stock</li><li>Proformas &amp; invoices</li><li>Delivery vouchers</li></ul>
        <div className="motto">{B.motto}</div><div className="bar" />
      </section>
      <section className="cv-r">
        <div className="cv-top"><LangToggle /> <ThemeToggle /></div>
        <form className="in" onSubmit={submit}>
          <div className="cv-k">{B.garage} Garage</div>
          <h2>{t('Sign in')}</h2>
          <div className="cv-card">
            {!step2 ? <>
              <div className="f"><label htmlFor="lu">{t('Username')}</label><input id="lu" autoComplete="username" autoFocus value={u} onChange={e => setU(e.target.value)} /></div>
              <div className="f"><label htmlFor="lp">{t('Password')}</label><input id="lp" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></div>
            </> : <div className="f"><label htmlFor="lc">{t('Two-step code')}</label><input id="lc" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={code} onChange={e => setCode(e.target.value)} /><div className="mu small">{t('Enter the 6-digit code from your authenticator app')}</div></div>}
            {err && <p className="cv-err" role="alert">{err}</p>}
            <button className="cv-btn" type="submit" disabled={busy || !u || !p || (step2 && code.replace(/\s/g, '').length !== 6)}>{busy ? t('Signing in…') : step2 ? t('Confirm') : t('Sign in')}</button>
            {step2 && <button className="cv-btn" type="button" style={{ marginTop: 8, opacity: .8 }} onClick={() => { setStep2(false); setCode(''); setErr(''); }}>{t('Back')}</button>}
          </div>
          <div className="cv-note">{B.company}<br />{B.place} · {B.phone}</div>
        </form>
      </section>
    </div>
  );
}
