import { useEffect, useId, useRef, useState } from 'react';
import { searchParts } from '../lib/search.js';
import { money } from '../lib/format.js';

// Type a part number or any words of the description: matching parts appear under the box (not a drop-down to scroll through).
// value / onChange keep the typed text; onPick(part) runs when a part is chosen (click, or arrow keys + Enter).
// onMissing(text), when given, adds a button under "No part matches" (the point of sale uses it to record a lost sale).
export default function PartSearch({ label, stock, value, onChange, onPick, onMissing, placeholder = 'Type a part number or description', grow, 'aria-label': aria, disabled }) {
  const id = useId(), [open, setOpen] = useState(false), [hi, setHi] = useState(0), [rect, setRect] = useState(null), input = useRef(null);
  const text = String(value ?? ''), hits = open && text.trim() ? searchParts(stock, text) : [];
  const show = open && text.trim().length > 0 && (stock || []).length > 0;       // no stock list (a technician): plain text box

  // the list is positioned on the screen (not inside the table), so a table or dialog never cuts it off
  useEffect(() => {
    if (!show) return;
    const place = () => { const r = input.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 340) }); };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [show, text]);

  const pick = p => { setOpen(false); onPick(p); };
  const keys = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, Math.max(hits.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && show && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
    else if (e.key === 'Escape' && show) { e.stopPropagation(); setOpen(false); }          // closes the list, not the dialog behind it
  };
  const field = (
    <input id={id} ref={input} role="combobox" aria-expanded={show} aria-controls={id + '-l'} aria-autocomplete="list" aria-label={aria} autoComplete="off" disabled={disabled}
      placeholder={placeholder} value={text} onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keys} />
  );
  return (
    <div className="ps" style={grow ? { flex: grow } : undefined}>
      {label ? <label htmlFor={id}>{label}<span className="ps-in">{field}</span></label> : field}
      {show && rect && (
        <ul className="ps-list" id={id + '-l'} role="listbox" style={{ left: rect.left, top: rect.top, width: rect.width }}>
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(p); }} onMouseEnter={() => setHi(i)}>
              <b>{p.code}</b> <span>{p.name}</span>
              <span className="ps-meta">{money(p.price)} · {p.stock > 0 ? `${p.stock} in stock` : <em>out of stock</em>}</span>
            </li>
          ))}
          {!hits.length && (
            <li className="ps-none" onMouseDown={e => e.preventDefault()}>No part matches “{text.trim()}”.{onMissing && <> <button type="button" className="lnk" onMouseDown={e => { e.preventDefault(); setOpen(false); onMissing(text.trim()); }}>Record as lost sale</button></>}</li>
          )}
        </ul>
      )}
    </div>
  );
}
