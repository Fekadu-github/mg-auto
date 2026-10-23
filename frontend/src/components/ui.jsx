import { useEffect, useRef, useState } from 'react';
import { STATUS_NAME } from '../lib/constants.js';
import { makeOf } from '../lib/stock.js';
import Icon from './Icon.jsx';

export const Pill = ({ tone, children }) => <span className={'pill' + (tone ? ' ' + tone : '')}>{children}</span>;
// colour tells the stage at a glance: grey = waiting, blue = in the workshop, amber = needs the advisor, green = finished
const STAGE_TONE = { Created: 'n', Dispatched: '', 'At workshop': '', 'Work done': 'a', 'Back with SA': 'a', Closed: 'g', Invoiced: 'g', Delivered: 'g' };
// every stage has its own small icon too, so it reads without the colour (bright workshop light, colour-blind staff)
const STAGE_ICON = { Created: 'jobs', Dispatched: 'send', 'At workshop': 'wrench', 'Work done': 'check', 'Back with SA': 'user', Closed: 'lock', Invoiced: 'receipt', Delivered: 'truck' };
export const StatusPill = ({ status }) => <span className={'pill ic ' + (STAGE_TONE[status] ?? '')}><Icon name={STAGE_ICON[status] || 'info'} size={13} />{STATUS_NAME[status] || status}</span>;

// S / T / B chip next to a part number: the first letter of the part number tells the make (see lib/stock.js)
export const MakeChip = ({ code }) => { const m = makeOf(code); return m ? <span className={'mk mk-' + String(code).trim().charAt(0).toLowerCase()} title={m} aria-label={m}>{String(code).trim().charAt(0).toUpperCase()}</span> : <span className="mk mk-none" title="No model (oil or a general part)" aria-label="No model">–</span>; };

// A labelled form control. Pass the input as children, or use the shorthand <Field label="Name" {...bind('name')} />
export function Field({ label, children, grow, hint, ...input }) {
  return (
    <div style={grow ? { flex: grow } : undefined}>
      <label>{label}{children || <input {...input} />}</label>
      {hint && <div className="mu small">{hint}</div>}
    </div>
  );
}

// useForm({ name: '' }) -> [values, bind, set, reset]; <input {...bind('name')} /> is a controlled input
export function useForm(initial) {
  const [v, setV] = useState(initial);
  const bind = k => ({ value: v[k] ?? '', onChange: e => setV(s => ({ ...s, [k]: e.target.value })) });
  return [v, bind, patch => setV(s => ({ ...s, ...patch })), () => setV(initial)];
}

// The auto-save line under a form: what happened to the last change
export function SaveState({ state, restored }) {
  const at = state.at ? new Date(state.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const text = state.s === 'saving' ? 'Saving…' : state.s === 'saved' ? `All changes saved ${at}.`
    : state.s === 'error' ? `Not saved yet (${state.msg}). A copy is kept on this device and it will try again.`
    : restored ? 'Restored your unsaved changes from this device. Saving…' : 'Changes are saved by themselves as you type.';
  return <span className="mu small" role="status">{text}</span>;
}

export const Btn = ({ kind = '', ...p }) => <button type="button" className={'b ' + kind} {...p} />;

// head: titles, or { t, r, k }: r right-aligned, k = the sort key (shown as a button when the screen passes sort and onSort).
// On a phone every row becomes a small card; the cells are told their column title for that. Pass plain to keep a normal table there.
export function Table({ head, children, empty, cols, sort, onSort, plain }) {
  const ref = useRef(null);
  useEffect(() => {
    if (plain) return;
    const labels = head.map(h => String(h.t ?? h));
    ref.current?.querySelectorAll('tbody tr').forEach(tr => { if (tr.children.length === labels.length) [...tr.children].forEach((td, i) => td.setAttribute('data-label', labels[i])); });
  });
  return (
    <div className={'tw' + (plain ? '' : ' cards')} ref={ref}><table><thead><tr>{head.map((h, i) => {
      const on = h.k && sort?.key === h.k;
      return (
        <th key={i} className={h.r ? 'r' : ''} aria-sort={on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}>
          {h.k && onSort ? <button type="button" className={'th-s' + (on ? ' on' : '')} onClick={() => onSort(h.k)} title="Click to sort">{h.t}<span aria-hidden="true">{on ? (sort.dir === 'desc' ? '↓' : '↑') : '↕'}</span></button> : h.t ?? h}
        </th>
      );
    })}</tr></thead>
      <tbody>{children}{empty && <tr><td colSpan={cols || head.length} className="mu empty"><Icon name="inbox" size={28} /><span>{empty}</span></td></tr>}</tbody></table></div>
  );
}

// An icon is picked from the label (so every report card gets one); tone colours the chip
const STAT_ICONS = [[/reorder|stock|units|items/i, 'box', 'a'], [/parts/i, 'alert', 'a'], [/price/i, 'tag', 'a'], [/dispatch/i, 'jobs', 'n'], [/workshop/i, 'shop', ''], [/close|advisor/i, 'check', 'a'],
  [/invoice|cash|credit|collect|sales|value|total|paid|owed/i, 'receipt', 'g'], [/hour|time|clock/i, 'clock', ''], [/customer|vehicle/i, 'user', '']];
export const Stat = ({ label, value, small, icon, tone, onClick }) => {
  const hit = STAT_ICONS.find(([re]) => re.test(String(label))), ic = icon || hit?.[1] || 'gauge', tn = tone ?? hit?.[2] ?? '';
  const go = onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()), 'aria-label': `${label}: ${value}. Open the list` } : {};
  return <div className={'box stat-card' + (onClick ? ' stat-go' : '')} {...go}><span className={'stat-ic ' + tn}><Icon name={ic} size={20} /></span><div className="stat" style={small ? { fontSize: 30 } : undefined}>{value}</div><div className="stat-l">{label}{onClick && <Icon name="chev" size={14} className="stat-ch" />}</div></div>;
};

// A native <dialog> opened as a modal. onClose runs when the person presses Esc or the Close button.
export function Dialog({ title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current, onNativeClose = () => onClose();
    if (!d.open) d.showModal();
    d.addEventListener('close', onNativeClose);
    return () => { d.removeEventListener('close', onNativeClose); if (d.open) d.close(); };   // listener removed first, so closing here never closes a newer dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="dlg-title">
      <div className="row dlg-head"><h2 id="dlg-title" style={{ flex: 1 }}>{title}</h2><Btn kind="ol" onClick={() => ref.current.close()}>Close window</Btn></div>
      {children}
      {actions && <div className="row mt">{actions}</div>}
    </dialog>
  );
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className="toast" role="alert" key={toast.id}><span>{toast.text}</span><button type="button" aria-label="Dismiss" onClick={onClose}>×</button></div>;
}
