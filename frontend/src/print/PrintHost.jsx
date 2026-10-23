import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const PrintCtx = createContext({ print: () => {} });
export const usePrint = () => useContext(PrintCtx);

export const PAGE = { a4: '@page{size:A4;margin:12mm}', pos: '@page{size:80mm auto;margin:3mm}' };

const MM = 96 / 25.4;
const PAGE_H = 273 * MM;      // A4 297 mm minus the 12 mm margins above and below
const FIT_H = 268 * MM;       // a little less, so rounding never makes a blank extra page

/** Fits a Service Price Estimation sheet (proforma or estimate) on the paper:
 *  1. tries the normal, then "compact", then "tight" size, and keeps the first one that fits ONE page;
 *  2. if it still needs more pages, sizes the sheet to a whole number of pages so the terms, signatures and footer land at the bottom of the last page.
 *  It measures the sheet in a hidden, laid-out copy of #print (on screen #print is display:none). Anything that goes wrong leaves the plain layout. */
export function fitSheet(root) {
  const art = root && root.querySelector('article.est');
  if (!art) return;
  const keep = { root: root.getAttribute('style'), art: art.getAttribute('style') };
  try {
    root.style.cssText = 'display:block;position:absolute;left:-10000px;top:0;visibility:hidden;width:186mm;';
    art.style.cssText = 'padding:0;margin:0;width:186mm;min-height:0;display:block;';
    let used = 'normal';
    for (const d of ['normal', 'compact', 'tight']) { art.dataset.density = d; used = d; if (art.scrollHeight <= FIT_H) break; }
    const h = art.scrollHeight, pages = Math.max(1, Math.ceil(h / PAGE_H));
    art.dataset.density = used;
    keep.minHeight = pages > 1 ? Math.round(pages * PAGE_H - 3 * MM) : 0;
  } catch { /* keep the plain layout */ }
  finally {
    if (keep.root === null) root.removeAttribute('style'); else root.setAttribute('style', keep.root);
    if (keep.art === null) art.removeAttribute('style'); else art.setAttribute('style', keep.art);
    if (keep.minHeight) art.style.minHeight = keep.minHeight + 'px';
  }
}

// print(<Document />, 'a4' | 'pos') puts the document into #print, waits a moment for images, and opens the browser's print dialog.
// On screen #print is hidden; when printing, everything else is hidden (see print.css).
// The page title becomes the file name when the person chooses "Save as PDF" in the print window, so it is set to the document number.
export function PrintProvider({ children }) {
  const [job, setJob] = useState(null);
  const print = useCallback((node, size = 'a4', title) => setJob({ node, size, title, id: Date.now() }), []);

  useEffect(() => {
    if (!job) return;
    const old = document.title;
    const t = setTimeout(() => {
      if (job.size === 'a4') fitSheet(document.getElementById('print'));
      if (job.title) document.title = job.title;
      window.print();
    }, 150);
    const done = () => { document.title = old; setJob(null); };
    window.addEventListener('afterprint', done);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.title = old; };
  }, [job]);

  return (
    <PrintCtx.Provider value={{ print }}>
      {children}
      {createPortal(<div id="print">{job && <><style>{PAGE[job.size]}</style>{job.node}</>}</div>, document.body)}
    </PrintCtx.Provider>
  );
}
