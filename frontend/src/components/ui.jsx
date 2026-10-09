import { useEffect, useRef, useState } from 'react';
import { STATUS_NAME } from '../lib/constants.js';

export const Pill = ({ tone, children }) => <span className={'pill' + (tone ? ' ' + tone : '')}>{children}</span>;
export const StatusPill = ({ status }) => <Pill tone={status === 'Delivered' ? 'g' : ''}>{STATUS_NAME[status] || status}</Pill>;

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

export const Btn = ({ kind = '', ...p }) => <button type="button" className={'b ' + kind} {...p} />;

export const Table = ({ head, children, empty, cols }) => (
  <div className="tw"><table><thead><tr>{head.map((h, i) => <th key={i} className={h.r ? 'r' : ''}>{h.t ?? h}</th>)}</tr></thead>
    <tbody>{children}{empty && <tr><td colSpan={cols || head.length} className="mu">{empty}</td></tr>}</tbody></table></div>
);

export const Stat = ({ label, value, small }) => <div className="box"><div className="stat" style={small ? { fontSize: 30 } : undefined}>{value}</div>{label}</div>;

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
