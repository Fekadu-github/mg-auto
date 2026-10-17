import { useState } from 'react';
import { AppProvider, useApp } from './store.jsx';
import { PrintProvider } from './print/PrintHost.jsx';
import { Toast } from './components/ui.jsx';
import Cover from './components/Cover.jsx';
import { ModalRoot } from './dialogs/Dialogs.jsx';
import { Customers, Dashboard, Estimates, Insurance, JobCards, LabourList, PAGE_INFO, Proformas, Reports, Services, Staff, Workshop } from './pages/Pages.jsx';
import { LowStockReminder, Parts, Purchases } from './pages/Stock.jsx';
import { Invoices, PointOfSale } from './pages/Pos.jsx';
import StockReports from './pages/StockReports.jsx';
import { ROLES, isSA, isTech } from './lib/constants.js';

const PAGES = { dash: Dashboard, jobs: JobCards, pro: Proformas, est: Estimates, ins: Insurance, lab: LabourList, svc: Services, shop: Workshop, cust: Customers, inv: Parts, pur: Purchases, pos: PointOfSale, invc: Invoices, srep: StockReports, rep: Reports, staff: Staff };

function Shell() {
  const { me, signOut } = useApp();
  const [tab, setTab] = useState('dash');
  const menu = [['dash', 'Dashboard'], ['jobs', 'Job cards'], ...(isTech(me) ? [] : [['pro', 'Proformas'], ['est', 'Estimates']]), ['shop', 'Workshop'], ['cust', 'Customers'],
    ...(isTech(me) ? [] : [['inv', 'Parts stock']]), ...(isSA(me) ? [['pos', 'Point of sale'], ['invc', 'Invoices & payments'], ['pur', 'Purchases (GRN)']] : []),
    ...(isTech(me) ? [] : [['svc', 'Services'], ['lab', 'Labour list'], ['ins', 'Insurance']]), ['rep', isTech(me) ? 'My hours' : 'Reports'], ...(isSA(me) ? [['srep', 'Stock & sales reports']] : []), ...(me.role === 'ADMIN' ? [['staff', 'Staff']] : [])];
  const Page = PAGES[tab] || Dashboard, [title, text] = PAGE_INFO[tab] || PAGE_INFO.dash;
  return (
    <div className="app">
      <aside className="sb">
        <div className="sb-top"><img className="sb-logo" src="/madeg-logo.png" alt="" /><div><div className="sb-n1">MADEG</div><div className="sb-n2">Garage · MG Auto</div></div></div>
        <nav className="sb-mid" aria-label="Main">
          {menu.map(([k, n]) => <button key={k} type="button" className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{n}</button>)}
        </nav>
        <div className="sb-bot">
          <div className="who"><b>{me.name}</b><span>{ROLES[me.role]}</span><span>MADEG Garage</span></div>
          <button type="button" className="so" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="page">
        <h1>{tab === 'rep' && isTech(me) ? 'My hours' : title}</h1>
        <p className="pd">{text}</p>
        <Page />
      </main>
    </div>
  );
}

function Root() {
  const { me, toast, dismissToast } = useApp();
  return <>{me ? <Shell /> : <Cover />}{me && <ModalRoot />}{me && <LowStockReminder />}<Toast toast={toast} onClose={dismissToast} /></>;
}

export default function App() {
  return <AppProvider><PrintProvider><Root /></PrintProvider></AppProvider>;
}
