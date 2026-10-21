import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './store.jsx';
import { PrintProvider } from './print/PrintHost.jsx';
import { Toast } from './components/ui.jsx';
import Splash from './components/Splash.jsx';
import PageLoader from './components/PageLoader.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { PAGE_MS, SPLASH_MS, SPLASH_STEPS, WELCOME_MS, WELCOME_STEPS } from './lib/loading.js';
import Cover from './components/Cover.jsx';
import { ModalRoot } from './dialogs/Dialogs.jsx';
import { Customers, Dashboard, Estimates, Insurance, JobCards, LabourList, PAGE_INFO, Proformas, Reports, Services, Staff, Workshop } from './pages/Pages.jsx';
import { LowStockReminder, Parts, Purchases } from './pages/Stock.jsx';
import { Invoices, PointOfSale } from './pages/Pos.jsx';
import StockReports from './pages/StockReports.jsx';
import Audit from './pages/Audit.jsx';
import { ROLES, isMgr, isSA, isTech } from './lib/constants.js';

const PAGES = { dash: Dashboard, jobs: JobCards, pro: Proformas, est: Estimates, ins: Insurance, lab: LabourList, svc: Services, shop: Workshop, cust: Customers, inv: Parts, pur: Purchases, pos: PointOfSale, invc: Invoices, srep: StockReports, rep: Reports, staff: Staff, audit: Audit };

// Line icons (24 px grid) for the menu
const Ico = ({ children }) => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const ICONS = {
  dash: <Ico><rect x="3" y="3" width="7.5" height="9" rx="1.8" /><rect x="13.5" y="3" width="7.5" height="5" rx="1.8" /><rect x="13.5" y="11" width="7.5" height="10" rx="1.8" /><rect x="3" y="15" width="7.5" height="6" rx="1.8" /></Ico>,
  jobs: <Ico><path d="M9 4h6v3H9z" /><path d="M7 5.5H5.5v15h13v-15H17" /><path d="M9 12h6M9 16h4" /></Ico>,
  pro: <Ico><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></Ico>,
  est: <Ico><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></Ico>,
  shop: <Ico><path d="M14.5 6.5a4 4 0 01-5 5L4 17l3 3 5.5-5.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z" /></Ico>,
  cust: <Ico><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 010 6M18 14c2 .6 3.5 2.5 3.5 5" /></Ico>,
  inv: <Ico><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5L12 12l9-4.5M12 12v9" /></Ico>,
  pos: <Ico><path d="M5 4h14v17l-2.3-1.6L14.3 21 12 19.4 9.7 21l-2.4-1.6L5 21z" /><path d="M8.5 9h7M8.5 13h5" /></Ico>,
  invc: <Ico><rect x="3" y="5" width="18" height="14" rx="2.2" /><path d="M3 10h18M7 15h4" /></Ico>,
  pur: <Ico><path d="M12 3v11M8 10l4 4 4-4" /><path d="M4 15v4h16v-4" /></Ico>,
  svc: <Ico><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></Ico>,
  lab: <Ico><path d="M4 6h10M4 12h7M4 18h7" /><path d="M14.5 16l2.5 2.5L22 13" /></Ico>,
  ins: <Ico><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></Ico>,
  rep: <Ico><path d="M4 20V11M10 20V5M16 20v-8" /><path d="M2 20h20" /></Ico>,
  srep: <Ico><path d="M12 3a9 9 0 109 9h-9z" /><path d="M15 3.5A9 9 0 0120.5 9H15z" /></Ico>,
  audit: <Ico><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></Ico>,
  staff: <Ico><rect x="4" y="4" width="16" height="16" rx="2.2" /><circle cx="12" cy="10" r="2.6" /><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" /></Ico>
};

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
  const Page = PAGES[tab] || Dashboard, [title, text] = PAGE_INFO[tab] || PAGE_INFO.dash;
  return (
    <div className="app">
      <aside className="sb">
        <div className="sb-top"><img className="sb-logo" src="/madeg-logo.png" alt="" /><div><div className="sb-n1">MADEG</div><div className="sb-n2">Garage · MG Auto</div></div><ThemeToggle className="sb-tt" /></div>
        <nav className="sb-mid" aria-label="Main">
          {menu.map(([k, n]) => <button key={k} type="button" className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{ICONS[k]}<span>{n}</span></button>)}
        </nav>
        <div className="sb-bot">
          <div className="av" aria-hidden="true">{(me.name || '?').slice(0, 1).toUpperCase()}</div>
          <div className="who"><b>{me.name}</b><span>{ROLES[me.role]}</span></div>
          <button type="button" className="so" onClick={signOut} aria-label="Sign out" title="Sign out">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </div>
      </aside>
      <main className="page">
        <div className="pg" key={tab}>
          <h1>{tab === 'rep' && isTech(me) ? 'My hours' : title}</h1>
          <p className="pd">{text}</p>
          {opening ? <PageLoader label={`Opening ${tab === 'rep' && isTech(me) ? 'My hours' : title}`} /> : <Page />}
        </div>
      </main>
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
  return <AppProvider><PrintProvider><Root /></PrintProvider></AppProvider>;
}
