import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { matchPages, searchEverything } from '../lib/globalSearch.js';
import { MakeChip, StatusPill } from './ui.jsx';
import Icon from './Icon.jsx';
import { t } from '../lib/i18n.js';

const KIND_ICON = { job: 'jobs', customer: 'cust', vehicle: 'car', part: 'box', page: 'chev' };
// One search box for everything: job card number, customer name or phone, plate or VIN, part number or description.
// Opens with Ctrl+K (⌘K) or "/", and from the search buttons. Enter opens the highlighted result.
export default function CommandPalette({ pages, onClose, onChoose }) {
  const { db, me } = useApp();
  const ref = useRef(null), list = useRef(null);
  const [text, setText] = useState(''), [hi, setHi] = useState(0);
  useEffect(() => { const d = ref.current; if (!d.open) d.showModal(); const c = () => onClose(); d.addEventListener('close', c); return () => { d.removeEventListener('close', c); if (d.open) d.close(); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const groups = useMemo(() => {
    const g = searchEverything({ db, text, me });
    const pg = matchPages(pages, text);
    if (pg.length) g.push({ key: 'page', label: 'Go to', items: pg });
    if (!text.trim()) return [{ key: 'page', label: 'Go to', items: pages.slice(0, 8).map(([k, label]) => ({ type: 'page', id: k, title: label, sub: '' })) }];
    return g;
  }, [db, text, me, pages]);
  const flat = groups.flatMap(g => g.items);
  useEffect(() => setHi(0), [text]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [hi]);

  const keys = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && flat[hi]) { e.preventDefault(); onChoose(flat[hi]); }
  };
  let idx = -1;
  return (
    <dialog ref={ref} className="pal" aria-label={t('Search')}>
      <div className="pal-in"><Icon name="search" size={20} />
        <input autoFocus role="combobox" aria-expanded="true" aria-controls="pal-l" aria-autocomplete="list" autoComplete="off" spellCheck="false" value={text} onChange={e => setText(e.target.value)} onKeyDown={keys}
          placeholder={t('Search job card, customer, phone, plate, part number…')} aria-label={t('Search')} />
        <button type="button" className="pal-x" onClick={() => ref.current.close()} aria-label="Close"><Icon name="x" size={18} /></button></div>
      <div className="pal-l" id="pal-l" role="listbox" ref={list}>
        {groups.map(g => (
          <div key={g.key} className="pal-g"><div className="pal-h">{t(g.label)}</div>
            {g.items.map(r => { idx += 1; const i = idx; return (
              <div key={r.type + r.id} role="option" aria-selected={i === hi} className={'pal-r' + (i === hi ? ' on' : '')} onMouseEnter={() => setHi(i)} onMouseDown={e => { e.preventDefault(); onChoose(r); }}>
                <span className="pal-ic">{r.type === 'part' ? <MakeChip code={r.title} /> : <Icon name={KIND_ICON[r.type]} size={18} />}</span>
                <span className="pal-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                {r.status && <StatusPill status={r.status} />}{r.low && <span className="pill a">low</span>}
              </div>); })}
          </div>))}
        {text.trim() && !flat.length && <div className="pal-none">{t('Nothing found for')} “{text.trim()}”.</div>}
      </div>
      <div className="pal-f mu small"><span><kbd>↑</kbd><kbd>↓</kbd> {t('move')}</span><span><kbd>Enter</kbd> {t('open')}</span><span><kbd>Esc</kbd> {t('close')}</span></div>
    </dialog>
  );
}
