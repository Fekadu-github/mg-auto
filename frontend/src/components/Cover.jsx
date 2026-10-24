import { useState } from 'react';
import { useApp } from '../store.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import LangToggle from './LangToggle.jsx';
import { t } from '../lib/i18n.js';
import Icon from './Icon.jsx';
import Credit from './Credit.jsx';

const B = { garage: 'MADEG', rest: 'GENERAL TRADING PLC', system: 'MG Auto', motto: 'Your car, our care', company: 'MADEG GENERAL TRADING PLC', place: 'Gurdshola, around Top Ten Hotel', phone: '0980766566' };

// The hero art: the logo's ring (blue to green) drawn once on load, with a line drawing of a car and speed lines
function Hero() {
  return (
    <svg className="cv-art" viewBox="0 0 560 420" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f8cff" /><stop offset=".55" stopColor="#2f8cff" /><stop offset="1" stopColor="#86d13f" /></linearGradient>
        <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7e8aa0" /><stop offset=".5" stopColor="#e8eef8" /><stop offset="1" stopColor="#7e8aa0" /></linearGradient>
      </defs>
      <circle className="cv-ring" cx="280" cy="210" r="188" pathLength="100" />
      <circle cx="280" cy="210" r="150" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
      <g className="cv-speed" stroke="#2f8cff" strokeWidth="2" strokeLinecap="round" opacity=".55"><path d="M6 238h70M26 262h56M0 286h82" /></g>
      <g className="cv-car" transform="translate(22 140) scale(1.45)" fill="none" stroke="url(#steel)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M6 96c0-10 8-15 22-18l40-10c20-22 48-34 92-34h56c28 0 50 14 68 34l42 10c14 3 22 8 22 18v8h-30M60 104H6M273 104H133M60 104" transform="translate(0 0)" />
        <path d="M60 104a24 24 0 0148 0M270 104a24 24 0 0148 0" />
        <path d="M92 66c14-16 36-26 70-26h50c20 0 38 10 52 26z" /><path d="M170 40v26" />
        <circle cx="84" cy="104" r="19" /><circle cx="84" cy="104" r="7" /><circle cx="294" cy="104" r="19" /><circle cx="294" cy="104" r="7" />
        <path d="M352 88h10" stroke="#86d13f" />
      </g>
      <path d="M40 322h480" stroke="rgba(255,255,255,.14)" strokeWidth="1" strokeDasharray="2 8" />
    </svg>
  );
}

const FEATURES = [['jobs', 'Job cards', 'From reception to hand-over'], ['clock', 'Workshop clocks', 'Technician hours, per task'], ['box', 'Parts stock', 'Issue, reorder, purchase'], ['receipt', 'Invoices', 'Proformas, cash and credit']];

// Cover and sign-in page
export default function Cover() {
  const { signIn } = useApp();
  const [u, setU] = useState(''), [p, setP] = useState(''), [show, setShow] = useState(false), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [code, setCode] = useState(''), [step2, setStep2] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await signIn(u.trim(), p, step2 ? code.replace(/\s/g, '') : ''); if (r?.need2fa) { setStep2(true); setBusy(false); } } catch (x) { setErr(x.message); setBusy(false); if (step2) setCode(''); }
  };
  return (
    <div className="cv">
      <section className="cv-l">
        <header className="cv-brand"><img className="cv-logo" src="/madeg-logo.png" alt="MG Auto logo" /><div><b>{B.garage}</b> {B.rest}<span>{B.system} · Workshop system</span></div></header>
        <div className="cv-hero">
          <h1>{B.motto}.</h1>
          <p>Job cards, workshop clocks, parts stock and invoicing for {B.company} ({B.system}): one system from the front desk to the bay.</p>
          <Hero />
        </div>
        <ul className="cv-feat" aria-label="What the system does">{FEATURES.map(([ic, h, d]) => <li key={h}><Icon name={ic} size={22} /><b>{h}</b><span>{d}</span></li>)}</ul>
      </section>
      <section className="cv-r">
        <div className="cv-top"><LangToggle /> <ThemeToggle /></div>
        <form className="in" onSubmit={submit}>
          <h2>{t('Sign in')}</h2>
          <p className="cv-sub">{B.company}</p>
          <div className="cv-card">
            {!step2 ? <>
              <div className="f"><label htmlFor="lu">{t('Username')}</label><div className="fi"><Icon name="user" size={18} /><input id="lu" autoComplete="username" autoFocus value={u} onChange={e => setU(e.target.value)} /></div></div>
              <div className="f"><label htmlFor="lp">{t('Password')}</label><div className="fi"><Icon name="lock" size={18} /><input id="lp" type={show ? 'text' : 'password'} autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /><button type="button" className="fi-b" onClick={() => setShow(v => !v)} aria-label={show ? t('Hide password') : t('Show password')} aria-pressed={show}><Icon name={show ? 'eyeoff' : 'eye'} size={18} /></button></div></div>
            </> : <div className="f"><label htmlFor="lc">{t('Two-step code')}</label><input id="lc" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={code} onChange={e => setCode(e.target.value)} /><div className="mu small">{t('Enter the 6-digit code from your authenticator app')}</div></div>}
            {err && <p className="cv-err" role="alert">{err}</p>}
            <button className="cv-btn" type="submit" disabled={busy || !u || !p || (step2 && code.replace(/\s/g, '').length !== 6)}>{busy ? t('Signing in…') : step2 ? t('Confirm') : t('Sign in')}</button>
            {step2 && <button className="cv-btn" type="button" style={{ marginTop: 8, opacity: .8 }} onClick={() => { setStep2(false); setCode(''); setErr(''); }}>{t('Back')}</button>}
          </div>
          <div className="cv-note"><Icon name="shield" size={16} />Secure sign-in · {B.place} · {B.phone}</div>
        </form>
        <Credit />
      </section>
    </div>
  );
}
