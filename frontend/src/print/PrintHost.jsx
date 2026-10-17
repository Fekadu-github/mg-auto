import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const PrintCtx = createContext({ print: () => {} });
export const usePrint = () => useContext(PrintCtx);

export const PAGE = { a4: '@page{size:A4;margin:12mm}', pos: '@page{size:80mm auto;margin:3mm}' };

// print(<Document />, 'a4' | 'pos') puts the document into #print, waits a moment for images, and opens the browser's print dialog.
// On screen #print is hidden; when printing, everything else is hidden (see print.css).
export function PrintProvider({ children }) {
  const [job, setJob] = useState(null);
  const print = useCallback((node, size = 'a4') => setJob({ node, size, id: Date.now() }), []);

  useEffect(() => {
    if (!job) return;
    const t = setTimeout(() => window.print(), 150), done = () => setJob(null);
    window.addEventListener('afterprint', done);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [job]);

  return (
    <PrintCtx.Provider value={{ print }}>
      {children}
      {createPortal(<div id="print">{job && <><style>{PAGE[job.size]}</style>{job.node}</>}</div>, document.body)}
    </PrintCtx.Provider>
  );
}
