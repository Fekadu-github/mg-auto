// One icon set for the whole app: 24 px grid, 1.7 px rounded line. <Icon name="car" /> takes its colour from the text (currentColor).
export const PATHS = {
  dash: <><rect x="3" y="3" width="7.5" height="9" rx="1.8" /><rect x="13.5" y="3" width="7.5" height="5" rx="1.8" /><rect x="13.5" y="11" width="7.5" height="10" rx="1.8" /><rect x="3" y="15" width="7.5" height="6" rx="1.8" /></>,
  jobs: <><path d="M9 4h6v3H9z" /><path d="M7 5.5H5.5v15h13v-15H17" /><path d="M9 12h6M9 16h4" /></>,
  pro: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  est: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>,
  shop: <><path d="M14.5 6.5a4 4 0 01-5 5L4 17l3 3 5.5-5.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z" /></>,
  cust: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 010 6M18 14c2 .6 3.5 2.5 3.5 5" /></>,
  inv: <><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5L12 12l9-4.5M12 12v9" /></>,
  pos: <><path d="M5 4h14v17l-2.3-1.6L14.3 21 12 19.4 9.7 21l-2.4-1.6L5 21z" /><path d="M8.5 9h7M8.5 13h5" /></>,
  invc: <><rect x="3" y="5" width="18" height="14" rx="2.2" /><path d="M3 10h18M7 15h4" /></>,
  pur: <><path d="M12 3v11M8 10l4 4 4-4" /><path d="M4 15v4h16v-4" /></>,
  svc: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  lab: <><path d="M4 6h10M4 12h7M4 18h7" /><path d="M14.5 16l2.5 2.5L22 13" /></>,
  ins: <><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  rep: <><path d="M4 20V11M10 20V5M16 20v-8" /><path d="M2 20h20" /></>,
  srep: <><path d="M12 3a9 9 0 109 9h-9z" /><path d="M15 3.5A9 9 0 0120.5 9H15z" /></>,
  audit: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  staff: <><rect x="4" y="4" width="16" height="16" rx="2.2" /><circle cx="12" cy="10" r="2.6" /><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" /></>,
  car: <><path d="M3 15.5V13l2-5.2A2 2 0 016.9 6.5h10.2A2 2 0 0119 7.8L21 13v2.5" /><path d="M3 15.5h18v2.2a.8.8 0 01-.8.8H19a1 1 0 01-1-1v-1M3 15.5v2.2a.8.8 0 00.8.8H5a1 1 0 001-1v-1" /><circle cx="7.5" cy="13.2" r=".9" /><circle cx="16.5" cy="13.2" r=".9" /><path d="M6 10h12" /></>,
  gauge: <><path d="M4.5 17a8.5 8.5 0 1115 0" /><path d="M12 13l4-4" /><circle cx="12" cy="13.5" r="1.2" /><path d="M7 10.5l.8.6M12 6.5V8M17 10.5l-.8.6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  box: <><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></>,
  receipt: <><path d="M6 3h12v18l-2.2-1.5L13.6 21 12 19.6 10.4 21l-2.2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /><path d="M12 14.5v2.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeoff: <><path d="M3 3l18 18" /><path d="M10.2 5.7A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-3 3.7M6.6 7.2A16 16 0 002.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.8-.8" /><path d="M9.9 9.9a2.8 2.8 0 003.9 3.9" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8.3 12.2l2.5 2.5 4.9-5" /></>,
  alert: <><path d="M12 3.5l9 15.5H3z" /><path d="M12 10v4M12 16.8v.01" /></>,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 011-1h7.7l8.3 8.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0z" /><circle cx="8" cy="8" r="1.3" /></>,
  inbox: <><path d="M3.5 13l2.4-7.2A1.5 1.5 0 017.3 4.8h9.4a1.5 1.5 0 011.4 1L20.5 13" /><path d="M3.5 13v5a1.5 1.5 0 001.5 1.5h14a1.5 1.5 0 001.5-1.5v-5h-5a3.5 3.5 0 01-7 0z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  logout: <><path d="M9 21H5.5A1.5 1.5 0 014 19.5v-15A1.5 1.5 0 015.5 3H9" /><path d="M16 16.5l4.5-4.5L16 7.5M20.5 12H9" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.4-3.1 7.9-7.5 9.5-4.4-1.6-7.5-5.1-7.5-9.5V6z" /></>,
  bolt: <><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" /></>,
};
export const ICON_NAMES = Object.keys(PATHS);
export default function Icon({ name, size, className = '', ...rest }) {
  return (
    <svg className={'ico ' + className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name] || PATHS.dash}
    </svg>
  );
}
