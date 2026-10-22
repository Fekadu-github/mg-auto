import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './store.jsx';
import { PrintProvider } from './print/PrintHost.jsx';
import { Toast } from './components/ui.jsx';
import Splash from './components/Splash.jsx';
import PageLoader from './components/PageLoader.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { PAGE_MS, SPLASH_MS, SPLASH_STEPS, WELCOME_MS, WELCOME_STEPS } from './lib/loading.js';
import Cover from './components/Cover.jsx';
import Icon, { ICON_NAMES } from './components/Icon.jsx';
import { ModalRoot } from './dialogs/Dialogs.jsx';
import { Customers, Dashboard, Estimates, Insurance, JobCards, LabourList, PAGE_INFO, Proformas, Reports, Services, Staff, Workshop } from './pages/Pages.jsx';
import { LowStockReminder, Parts, Purchases } from './pages/Stock.jsx';
import { Invoices, PointOfSale } from './pages/Pos.jsx';
import StockReports from './pages/StockReports.jsx';
import Audit from './pages/Audit.jsx';
import { ROLES, isMgr, isSA, isTech } from './lib/constants.js';
import { t } from './lib/i18n.js';
import LangToggle from './components/LangToggle.jsx';
import Approve from './pages/Approve.jsx';
import { TwoFactorNag } from './components/TwoFactorNag.jsx';

const PAGES = { dash: Dashboard, jobs: JobCards, pro: Proformas, est: Estimates, ins: Insurance, lab: LabourList, svc: Services, shop: Workshop, cust: Customers, inv: Parts, pur: Purchases, pos: PointOfSale, invc: Invoices, srep: StockReports, rep: Reports, staff: Staff, audit: Audit };

// Menu icons: the shared set in components/Icon.jsx
const ICONS = Object.fromEntries(ICON_NAMES.map(k => [k, <Icon name={k} />]));

// The menu is grouped so it stays short: on a computer the groups fold and the whole sidebar can shrink to icons;
// on a phone the same sidebar slides in from the left (menu button in the top bar).
const GROUPS = [['Work', ['dash', 'jobs', 'pro', 'est', 'shop', 'cust']], ['Sales & stock', ['pos', 'invc', 'inv', 'pur']], ['Setup', ['svc', 'lab', 'ins']], ['Reports', ['rep', 'srep']], ['Admin', ['staff', 'audit']]];
const stored = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

function Shell() {
  const { me, signOut, registerNav } = useApp();
  const [tab, setTab] = useState('dash'), [opening, setOpening] = useState(false);
  // a short "opening" state when moving between screens (see lib/loading.js)
  const go = k => { if (k === tab) return; setTab(k); if (PAGE_MS > 0) setOpening(true); };
  useEffect(() => { if (!opening) return; const t = setTimeout(() => setOpening(false), PAGE_MS); return () => clearTimeout(t); }, [opening, tab]);
  useEffect(() => { registerNav(go); });   // lets a dialog send the person to a list when its decision is made
  const menu = [['dash', 'Dashboard'], ['jobs', 'Job cards'], ...(isTech(me) ? [] : [['pro', 'Proformas'], ['est', 'Estimates']]), ['shop', 'Workshop'], ['cust', 'Customers'],
    ...(isTech(me) ? [] : [['inv', 'Parts stock']]), ...(isSA(me) ? [['pos', 'Point of sale'], ['invc', 'Invoices & payments'], ['pur', 'Purchases (GRN)']] : []),
    ...(isTech(me) ? [] : [['svc', 'Services'], ['lab', 'Labour list'], ['ins', 'Insurance']]), ['rep', isTech(me) ? 'My hours' : 'Reports'], ...(isSA(me) ? [['srep', 'Stock & sales reports']] : []), ...(isMgr(me) ? [['staff', 'Staff'], ['audit', 'Audit log']] : [])];
  const [folds, setFolds] = useState(() => stored('nav-folds', {})), [rail, setRail] = useState(() => stored('nav-rail', false)), [drawer, setDrawer] = useState(false);
  const label = Object.fromEntries(menu), groups = GROUPS.map(([g, ks]) => [g, ks.filter(k => label[k])]).filter(([, ks]) => ks.length);
  const isOpen = (g, ks) => ks.includes(tab) || (folds[g] ?? g === 'Work');   // the group of the screen you are on never hides it
  const fold = g => setFolds(f => { const n = { ...f, [g]: !(f[g] ?? g === 'Work') }; keep('nav-folds', n); return n; });
  const toggleRail = () => setRail(r => { keep('nav-rail', !r); return !r; });
  const pick = k => { setDrawer(false); go(k); };
  useEffect(() => { if (!drawer) return; const h = e => e.key === 'Escape' && setDrawer(false); addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, [drawer]);
  const Page = PAGES[tab] || Dashboard, [title, text] = PAGE_INFO[tab] || PAGE_INFO.dash;
  return (
    <div className={'app' + (rail ? ' rail' : '') + (drawer ? ' drawer-open' : '')}>
      <aside className="sb">
        <div className="sb-top"><img className="sb-logo" src="/madeg-logo.png" alt="" /><div><div className="sb-n1">MADEG</div><div className="sb-n2">Garage · MG Auto</div></div><LangToggle /> <ThemeToggle className="sb-tt" /></div>
        <nav className="sb-mid" aria-label="Main">
          {groups.map(([g, ks]) => { const open = isOpen(g, ks); return (
            <div key={g} className="ng">
              <button type="button" className="ng-h" aria-expanded={open} onClick={() => fold(g)} title={t(g)}><span>{t(g)}</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg></button>
              {open && ks.map(k => <button key={k} type="button" className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} title={t(label[k])} onClick={() => pick(k)}>{ICONS[k]}<span>{t(label[k])}</span></button>)}
            </div>); })}
        </nav>
        <button type="button" className="rail-t" onClick={toggleRail} aria-label={rail ? 'Expand menu' : 'Collapse menu'} title={rail ? 'Expand menu' : 'Collapse menu'}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: rail ? 'none' : 'rotate(180deg)' }}><path d="M9 6l6 6-6 6" /></svg></button>
        <div className="sb-bot">
          <div className="av" aria-hidden="true">{(me.name || '?').slice(0, 1).toUpperCase()}</div>
          <div className="who"><b>{me.name}</b><span>{ROLES[me.role]}</span></div>
          <button type="button" className="so" onClick={signOut} aria-label={t('Sign out')} title={t('Sign out')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </div>
      </aside>
      <main className="page">
        <div className="pg" key={tab}>
          <h1><span className="h-ic">{ICONS[tab]}</span>{t(tab === 'rep' && isTech(me) ? 'My hours' : title)}</h1>
          {isMgr(me) && <TwoFactorNag go={go} />}
          <p className="pd">{t(text)}</p>
          {opening ? <PageLoader label={`Opening ${tab === 'rep' && isTech(me) ? 'My hours' : title}`} /> : <Page />}
        </div>
      </main>
      <header className="mtb">
        <button type="button" className="mtb-b" onClick={() => setDrawer(true)} aria-label={t('Menu')} aria-expanded={drawer}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
        <b className="mtb-t">{t(tab === 'rep' && isTech(me) ? 'My hours' : title)}</b>
      </header>
      {drawer && <div className="dr-bd" onClick={() => setDrawer(false)} aria-hidden="true" />}
    </div>
  );
}

function Root() {
  const { me, ready, toast, dismissToast } = useApp();
  const [minDone, setMinDone] = useState(SPLASH_MS <= 0), [giveUp, setGiveUp] = useState(false), [welcome, setWelcome] = useState(false);
  // opening splash: at least SPLASH_MS, and (with a saved sign-in) until the first data has arrived, but never longer than 10 s
  useEffect(() => { if (minDone) return; const t = setTimeout(() => setMinDone(true), SPLASH_MS); return () => clearTimeout(t); }, [minDone]);
  useEffect(() => { const t = setTimeout(() => setGiveUp(true), 10000); return () => clearTimeout(t); }, []);
  // welcome screen right after a fresh sign-in
  const prevMe = useRef(me);
  useEffect(() => {
    const was = prevMe.current; prevMe.current = me;
    if (was || !me || WELCOME_MS <= 0) return;
    setWelcome(true); const t = setTimeout(() => setWelcome(false), WELCOME_MS); return () => clearTimeout(t);
  }, [me]);

  const booting = !minDone || (me && !ready && !giveUp), wait = booting || (me && welcome);
  return (
    <>
      {wait ? <Splash steps={booting ? SPLASH_STEPS : WELCOME_STEPS} ms={booting ? SPLASH_MS : WELCOME_MS} /> : me ? <Shell /> : <Cover />}
      {me && !wait && <ModalRoot />}{me && !wait && <LowStockReminder />}
      <Toast toast={toast} onClose={dismissToast} />
    </>
  );
}

export default function App() {
  // The customer's approval page opens from a link and needs no sign-in
  const m = /^#\/approve\/([A-Za-z0-9]{20,64})/.exec(location.hash);
  if (m) return <Approve token={m[1]} />;
  return <AppProvider><PrintProvider><Root /></PrintProvider></AppProvider>;
}
