import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store.jsx';
import { Table } from './ui.jsx';
import { searchEstimates } from '../lib/search.js';
import { SECTION_CODE } from '../lib/constants.js';
import { money, tot } from '../lib/format.js';

// "Mohammed A · AA-12345": who an estimate is for. An estimate made before the customer was registered shows the walk-in written on its proforma.
export function useEstimateWho() {
  const { db, cust, veh } = useApp();
  return e => {
    const src = db.pr.find(x => x.id === e.id);
    const name = e.cid ? cust(e.cid).name : src?.guest_name, plate = e.vid ? veh(e.vid).plate : src?.guest_plate;
    return [name, plate].filter(Boolean).join(' · ');
  };
}

// Type one letter (or a number, a name, a plate) and the finalized estimates that fit appear under the box. Click one, or arrow keys + Enter.
// `estimates` are the ones that may be chosen here; value / onChange keep the typed text; onPick(estimate) runs when one is chosen.
export default function EstimatePicker({ label, estimates, value, onChange, onPick, placeholder = 'Type a letter or number: EST-…', grow, disabled }) {
  const { db } = useApp(), who = useEstimateWho();
  const id = useId(), [open, setOpen] = useState(false), [hi, setHi] = useState(0), [rect, setRect] = useState(null), input = useRef(null);
  const text = String(value ?? '');
  const hits = open ? searchEstimates(estimates, text, who) : [];
  const show = open;
  useEffect(() => {
    if (!show) return undefined;
    const place = () => { const r = input.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 380) }); };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [show, text]);
  const pick = e => { setOpen(false); onPick(e); };
  const keys = k => {
    if (k.key === 'ArrowDown') { k.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, Math.max(hits.length - 1, 0))); }
    else if (k.key === 'ArrowUp') { k.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (k.key === 'Enter' && show && hits[hi]) { k.preventDefault(); pick(hits[hi]); }
    else if (k.key === 'Escape' && show) { k.stopPropagation(); setOpen(false); }
  };
  const field = (
    <input id={id} ref={input} role="combobox" aria-expanded={show} aria-controls={id + '-l'} aria-autocomplete="list" aria-label={label ? undefined : 'Estimate number'} autoComplete="off" disabled={disabled}
      placeholder={placeholder} value={text} onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keys} />
  );
  return (
    <div className="ps" style={grow ? { flex: grow } : undefined}>
      {label ? <label htmlFor={id}>{label}<span className="ps-in">{field}</span></label> : field}
      {show && rect && createPortal(
        <ul className="ps-list" id={id + '-l'} role="listbox" style={{ left: rect.left, top: rect.top, width: rect.width }}>
          {hits.map((e, i) => (
            <li key={e.id} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={x => { x.preventDefault(); pick(e); }} onMouseEnter={() => setHi(i)}>
              <b>{e.id}</b> <span>{[who(e), e.note].filter(Boolean).join(' · ') || 'no customer yet'}</span>
              <span className="ps-meta">{e.labours.length} labour · {e.parts.length} parts · ETB {money(tot(e, db.cfg.vat).total)}</span>
            </li>
          ))}
          {!hits.length && <li className="ps-none" onMouseDown={x => x.preventDefault()}>{text.trim() ? <>No finalized estimate matches “{text.trim()}”. A draft must be finalized first.</> : 'No finalized estimate is waiting for a job card.'}</li>}
        </ul>,
        input.current?.closest('dialog') || document.body
      )}
    </div>
  );
}

// The labour and parts an estimate will bring onto the job card, listed before it is loaded
export function EstimatePreview({ est }) {
  const { db } = useApp(), t = tot(est, db.cfg.vat);
  return (
    <div className="box mt">
      <b>{est.id}</b>{est.note && <span className="mu"> · {est.note}</span>}
      <Table head={['Labour', 'Section', { t: 'Hours', r: 1 }, { t: 'Cost', r: 1 }]} empty={!est.labours.length && 'No labour.'}>
        {est.labours.map((l, i) => <tr key={i}><td>{l.desc}</td><td>{SECTION_CODE[l.section] || ''}</td><td className="r">{l.hours || ''}</td><td className="r">{money(l.price)}</td></tr>)}
      </Table>
      <Table head={['Part', { t: 'Qty', r: 1 }, { t: 'Selling price', r: 1 }, { t: 'Total', r: 1 }]} empty={!est.parts.length && 'No parts.'}>
        {est.parts.map((p, i) => <tr key={i}><td>{p.code && <span className="mu">{p.code} </span>}{p.name}</td><td className="r">{p.qty}</td><td className="r">{money(p.price)}</td><td className="r">{money(p.qty * p.price)}</td></tr>)}
      </Table>
      <div className="r mt">Labour {money(t.l)} · Parts {money(t.p)} · VAT {money(t.vat)} · <b>Total ETB {money(t.total)}</b></div>
    </div>
  );
}
