import { useEffect, useId, useRef, useState } from 'react';
import { SECTION_CODE } from '../lib/constants.js';
import { groupHours, groupLabel } from '../lib/labourGroups.js';

const low = s => String(s ?? '').toLowerCase();
const words = s => low(s).split(/[^a-z0-9]+/).filter(Boolean);
// One letter is enough: a task shows when its code, task name, line name or model starts with the typed letters (any word of the name), best matches first
export function searchTasks(groups, singles, text, max = 40) {
  const toks = words(text);
  if (!toks.length) return [];
  const score = (fields) => {
    let total = 0;
    for (const tk of toks) {
      let best = 0;
      fields.forEach((f, i) => {
        const s = low(f);
        if (!s) return;
        if (s.startsWith(tk)) best = Math.max(best, 100 - i);
        else if (words(s).some(w => w.startsWith(tk))) best = Math.max(best, 60 - i);
        else if (tk.length > 2 && s.includes(tk)) best = Math.max(best, 20 - i);
      });
      if (!best) return 0;
      total += best;
    }
    return total;
  };
  const out = [];
  for (const g of groups) { const s = score([g.name, ...g.items.map(t => t.code)]); if (s) out.push({ kind: 'group', g, s: s + 5 }); }
  for (const t of singles) { const s = score([t.code, t.name, t.model_grp, SECTION_CODE[t.section]]); if (s) out.push({ kind: 'task', t, s }); }
  return out.sort((a, b) => b.s - a.s).slice(0, max);
}

// Search box for labour tasks. onPick({kind:'group'|'task', g|t}) runs when one is chosen (click, or arrow keys + Enter).
export default function TaskSearch({ groups, singles, value, onChange, onPick, 'aria-label': aria = 'Labour task', placeholder = 'Type a letter: code or task name', invalid }) {
  const id = useId(), [open, setOpen] = useState(false), [hi, setHi] = useState(0), [rect, setRect] = useState(null), input = useRef(null);
  const text = String(value ?? '');
  const hits = open ? searchTasks(groups, singles, text) : [];
  const show = open && text.trim().length > 0;
  useEffect(() => {
    if (!show) return undefined;
    const place = () => { const r = input.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 380) }); };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [show, text]);
  const pick = h => { setOpen(false); onPick(h); };
  const keys = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, Math.max(hits.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && show && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
    else if (e.key === 'Escape' && show) { e.stopPropagation(); setOpen(false); }
  };
  return (
    <div className="ps">
      <input id={id} ref={input} role="combobox" aria-expanded={show} aria-controls={id + '-l'} aria-autocomplete="list" aria-label={aria} aria-invalid={invalid || undefined} autoComplete="off"
        placeholder={placeholder} value={text} style={invalid ? { borderColor: 'var(--rd)' } : undefined}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keys} />
      {show && rect && (
        <ul className="ps-list" id={id + '-l'} role="listbox" style={{ left: rect.left, top: rect.top, width: rect.width }}>
          {hits.map((h, i) => (
            <li key={h.kind === 'group' ? 'g' + h.g.name : 't' + (h.t.id ?? h.t.code ?? h.t.name) + i} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(h); }} onMouseEnter={() => setHi(i)}>
              {h.kind === 'group'
                ? <><b>▤</b> <span>{h.g.name}</span><span className="ps-meta">{h.g.items.length} line{h.g.items.length === 1 ? '' : 's'} · {groupHours(h.g)} h</span></>
                : <><b>{h.t.code || SECTION_CODE[h.t.section]}</b> <span>{h.t.name}{h.t.model_grp ? ' · ' + h.t.model_grp : ''}</span><span className="ps-meta">{SECTION_CODE[h.t.section]} · {h.t.hours || 0} h</span></>}
            </li>
          ))}
          {!hits.length && <li className="ps-none" onMouseDown={e => e.preventDefault()}>No labour task matches “{text.trim()}”. Add it in the Labour list first.</li>}
        </ul>
      )}
    </div>
  );
}
export { groupLabel };
