import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store.jsx';
import { searchCustomers } from '../lib/search.js';

// Type one letter (a name, customer number, phone or plate) and the matching customers appear under the box. Click one, or arrow keys + Enter.
// value is the chosen customer's id ('' = nobody chosen); onPick(id) runs when one is chosen, and onPick('') when the box is emptied or retyped.
export default function CustomerPicker({ label, value, onPick, placeholder = 'Type a letter: name, phone or plate', grow }) {
  const { db } = useApp();
  const cur = db.c.find(c => c.id === value), shown = cur ? `${cur.name} (${cur.id})` : '';
  const id = useId(), [text, setText] = useState(shown), [open, setOpen] = useState(false), [hi, setHi] = useState(0), [rect, setRect] = useState(null), input = useRef(null);
  useEffect(() => { setText(shown); }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  const q = cur && text === shown ? '' : text;      // a chosen customer shows his name; focusing the box lists everyone again
  const hits = open ? searchCustomers(db.c, db.v, q) : [];
  const cars = cid => db.v.filter(v => v.cid === cid).map(v => v.plate).filter(Boolean).slice(0, 3).join(', ');
  useEffect(() => {
    if (!open) return undefined;
    const place = () => { const r = input.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 380) }); };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, text]);
  const pick = c => { setOpen(false); setText(`${c.name} (${c.id})`); onPick(c.id); };
  const keys = k => {
    if (k.key === 'ArrowDown') { k.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, Math.max(hits.length - 1, 0))); }
    else if (k.key === 'ArrowUp') { k.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (k.key === 'Enter' && open && hits[hi]) { k.preventDefault(); pick(hits[hi]); }
    else if (k.key === 'Escape' && open) { k.stopPropagation(); setOpen(false); }
  };
  const field = (
    <input id={id} ref={input} role="combobox" aria-expanded={open} aria-controls={id + '-l'} aria-autocomplete="list" aria-label={label ? undefined : 'Customer'} autoComplete="off"
      placeholder={placeholder} value={text} onChange={e => { setText(e.target.value); setOpen(true); setHi(0); if (value) onPick(''); }}
      onFocus={e => { setOpen(true); e.target.select(); }} onBlur={() => { setOpen(false); setText(shown); }} onKeyDown={keys} />
  );
  return (
    <div className="ps" style={grow ? { flex: grow } : undefined}>
      {label ? <label htmlFor={id}>{label}<span className="ps-in">{field}</span></label> : field}
      {open && rect && createPortal(
        <ul className="ps-list" id={id + '-l'} role="listbox" style={{ left: rect.left, top: rect.top, width: rect.width }}>
          {hits.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={x => { x.preventDefault(); pick(c); }} onMouseEnter={() => setHi(i)}>
              <b>{c.name}</b> <span>{c.id}{c.phone ? ` · ${c.phone}` : ''}</span><span className="ps-meta">{cars(c.id) || 'no vehicle yet'}</span>
            </li>
          ))}
          {!hits.length && <li className="ps-none" onMouseDown={x => x.preventDefault()}>No customer matches “{q.trim()}”.</li>}
        </ul>,
        input.current?.closest('dialog') || document.body
      )}
    </div>
  );
}
