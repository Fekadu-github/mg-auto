import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { searchParts } from '../lib/search.js';
import { money } from '../lib/format.js';
import { MakeChip } from './ui.jsx';
import ScanButton, { canScan } from './ScanButton.jsx';

// Type a part number or any words of the description: matching parts appear under the box (not a drop-down to scroll through).
// value / onChange keep the typed text; onPick(part) runs when a part is chosen (click, or arrow keys + Enter).
// onMissing(text), when given, adds a button under "No part matches" (the point of sale uses it to record a lost sale).
// remote: the search runs on the server (/parts/search) instead of in a stock list kept on the screen: for a technician, who is not sent the list (no prices are shown to them).
export default function PartSearch({ label, stock, remote, value, onChange, onPick, onMissing, placeholder = 'Type a part number or description', grow, 'aria-label': aria, disabled }) {
  const id = useId(), [open, setOpen] = useState(false), [hi, setHi] = useState(0), [rect, setRect] = useState(null), input = useRef(null);
  const [found, setFound] = useState({ q: '', rows: [] });
  const text = String(value ?? ''), typed = text.trim();
  useEffect(() => {
    if (!remote || !open || !typed) return undefined;
    let live = true;
    const t = setTimeout(() => api('/parts/search?q=' + encodeURIComponent(typed)).then(rows => live && setFound({ q: typed, rows })).catch(() => live && setFound({ q: typed, rows: [] })), 250);
    return () => { live = false; clearTimeout(t); };
  }, [remote, open, typed]);
  const searching = !!remote && found.q !== typed;
  const hits = remote ? (searching ? [] : found.rows) : open && typed ? searchParts(stock, text) : [];
  const show = open && typed.length > 0 && (remote || (stock || []).length > 0);       // no stock list and not remote: plain text box

  // the list is positioned on the screen (not inside the table), so a table or dialog never cuts it off
  useEffect(() => {
    if (!show) return;
    const place = () => { const r = input.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 340) }); };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [show, text]);

  const pick = p => { setOpen(false); onPick(p); };
  const scanned = async code => {
    const exact = r => (r || []).find(p => String(p.code).toLowerCase() === code.toLowerCase());
    const hit = remote ? exact(await api('/parts/search?q=' + encodeURIComponent(code)).catch(() => [])) : exact(stock);
    if (hit) pick(hit); else { onChange(code); setOpen(true); setHi(0); input.current?.focus(); }
  };
  const keys = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, Math.max(hits.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && show && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
    else if (e.key === 'Escape' && show) { e.stopPropagation(); setOpen(false); }          // closes the list, not the dialog behind it
  };
  const scan = canScan() && !disabled && ((stock || []).length > 0 || remote);
  const field = (
    <span className={'ps-box' + (scan ? ' has-scan' : '')}><input id={id} ref={input} role="combobox" aria-expanded={show} aria-controls={id + '-l'} aria-autocomplete="list" aria-label={aria} autoComplete="off" disabled={disabled}
      placeholder={placeholder} value={text} onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keys} />{scan && <ScanButton onCode={scanned} />}</span>
  );
  return (
    <div className="ps" style={grow ? { flex: grow } : undefined}>
      {label ? <label htmlFor={id}>{label}<span className="ps-in">{field}</span></label> : field}
      {show && rect && createPortal(
        <ul className="ps-list" id={id + '-l'} role="listbox" style={{ left: rect.left, top: rect.top, width: rect.width }}>
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(p); }} onMouseEnter={() => setHi(i)}>
              <MakeChip code={p.code} /> <b>{p.code}</b> <span>{p.name}</span>
              <span className="ps-meta">{p.price !== undefined ? <>{money(p.price)} · {p.stock > 0 ? `${p.stock} in stock` : <em>out of stock</em>}</> : p.in_stock ? 'in stock' : <em>out of stock</em>}</span>
            </li>
          ))}
          {!hits.length && searching && <li className="ps-none" onMouseDown={e => e.preventDefault()}>Searching…</li>}
          {!hits.length && !searching && (
            <li className="ps-none" onMouseDown={e => e.preventDefault()}>No part matches “{text.trim()}”.{onMissing && <> <button type="button" className="lnk" onMouseDown={e => { e.preventDefault(); setOpen(false); onMissing(text.trim()); }}>Record as lost sale</button></>}</li>
          )}
        </ul>,
        input.current?.closest('dialog') || document.body
      )}
    </div>
  );
}
