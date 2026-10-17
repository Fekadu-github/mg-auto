import { useState } from 'react';
import { useApp } from '../store.jsx';

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
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await signIn(u.trim(), p); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="cv">
      <section className="cv-l">
        <Rosette />
        <img className="cv-logo" src="/madeg-logo.png" alt="MG Auto logo" />
        <h1>{B.garage} <span>Garage</span></h1>
        <div className="sub">{B.system} · Workshop system</div>
        <p>Job cards, workshop clocks, parts stock and invoicing for {B.garage} Garage.</p>
        <div className="motto">{B.motto}</div><div className="bar" />
      </section>
      <section className="cv-r">
        <form className="in" onSubmit={submit}>
          <div className="cv-k">{B.garage} Garage</div>
          <h2>Sign in</h2>
          <div className="cv-card">
            <div className="f"><label htmlFor="lu">Username</label><input id="lu" autoComplete="username" autoFocus value={u} onChange={e => setU(e.target.value)} /></div>
            <div className="f"><label htmlFor="lp">Password</label><input id="lp" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></div>
            {err && <p className="cv-err" role="alert">{err}</p>}
            <button className="cv-btn" type="submit" disabled={busy || !u || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </div>
          <div className="cv-note">{B.company}<br />{B.place} · {B.phone}</div>
        </form>
      </section>
    </div>
  );
}
