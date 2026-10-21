import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiBlobUrl, apiUpload } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field } from './ui.jsx';
import { t } from '../lib/i18n.js';
import { dt } from '../lib/format.js';

const ITEMS = { body_front: 'Body: front', body_rear: 'Body: rear', body_left: 'Body: left side', body_right: 'Body: right side', windscreen: 'Windscreen and glass', lights: 'Lights', tyres: 'Tyres', spare: 'Spare wheel', mirrors: 'Mirrors', wipers: 'Wipers', dash_lights: 'Dashboard warning lights', interior: 'Seats and interior', audio: 'Radio / AC', tools: 'Jack and tools', fluids: 'Oil and fluid levels' };
const FUEL = ['E', '1/4', '1/2', '3/4', 'F'], LABELS = ['Front', 'Rear', 'Left side', 'Right side', 'Interior', 'Damage', 'Dashboard', 'Other'];
const EMPTY = { items: {}, fuel: '', damage: '', valuables: '', keys: '', notes: '' };

// Shrink a phone photo to about 1280 px JPEG (a few hundred KB) before it is sent
async function shrink(file, max = 1280) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((ok, no) => cv.toBlob(b => (b ? ok(b) : no(new Error('Cannot read this picture'))), 'image/jpeg', 0.8));
}

function Thumb({ photo, onDelete }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let u = ''; apiBlobUrl('/photos/' + photo.id).then(x => { u = x; setUrl(x); }).catch(() => {}); return () => { if (u) URL.revokeObjectURL(u); }; }, [photo.id]);
  return (
    <figure style={{ margin: 0, width: 120 }}>
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={photo.label} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, display: 'block' }} /></a> : <div className="mu" style={{ width: 120, height: 90 }}>…</div>}
      <figcaption className="mu small">{t(photo.label) || ''}{onDelete && <> · <button type="button" className="lnk" onClick={onDelete}>{t('Delete')}</button></>}</figcaption>
    </figure>
  );
}

// Reception inspection checklist and photos on the job card
export default function Inspection({ job, canEdit, canDelete }) {
  const { run, say } = useApp();
  const [d, setD] = useState(null), [f, setF] = useState(EMPTY), [busy, setBusy] = useState(false), [label, setLabel] = useState('Front'), pick = useRef(null);
  const load = useCallback(() => api(`/jobs/${job.id}/inspection`).then(x => { setD(x); setF(s => (x.inspection ? { ...EMPTY, ...x.inspection } : s)); }).catch(() => setD({ inspection: null, photos: [] })), [job.id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const set = p => setF(s => ({ ...s, ...p })), setItem = (k, v) => setF(s => ({ ...s, items: { ...s.items, [k]: v } }));
  const save = async () => { const r = await run(() => api(`/jobs/${job.id}/inspection`, 'PUT', f)); if (r.ok) { say(t('Inspection saved.')); load(); } };
  const upload = async files => {
    setBusy(true);
    try { for (const file of files) await apiUpload(`/jobs/${job.id}/photos?label=${encodeURIComponent(label)}`, await shrink(file)); await load(); }
    catch (e) { say(e.message); } finally { setBusy(false); if (pick.current) pick.current.value = ''; }
  };
  const del = async p => { if (!confirm(t('Delete') + '?')) return; const r = await run(() => api('/photos/' + p.id, 'DELETE')); if (r.ok) load(); };
  const problems = Object.values(f.items).filter(v => v === 'attn').length;
  return (
    <details className="box mt" open={!d.inspection && canEdit}>
      <summary><b>{t('Reception inspection and photos')}</b> <span className="mu small">· {d.photos.length} {t('photos')}{problems ? ` · ${problems} ${t('Problem').toLowerCase()}` : ''}</span></summary>
      <div className="mt">
        {canEdit ? <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '6px 16px' }}>
            {d.items.map(k => (
              <div key={k} className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span>{t(ITEMS[k] || k)}</span>
                <span style={{ display: 'flex', gap: 4 }}>{[['ok', 'OK'], ['attn', 'Problem'], ['na', 'N/A']].map(([v, n]) => <Btn key={v} kind={f.items[k] === v ? (v === 'attn' ? 'gr' : '') : 'ol'} aria-pressed={f.items[k] === v} onClick={() => setItem(k, f.items[k] === v ? '' : v)}>{t(n)}</Btn>)}</span>
              </div>
            ))}
          </div>
          <div className="row mt"><Field label={t('Fuel level')}><select value={f.fuel} onChange={e => set({ fuel: e.target.value })}><option value="">-</option>{FUEL.map(x => <option key={x}>{x}</option>)}</select></Field>
            <Field label={t('Keys handed over')} value={f.keys} onChange={e => set({ keys: e.target.value })} /></div>
          <Field label={t('Existing damage (scratches, dents)')} value={f.damage} onChange={e => set({ damage: e.target.value })} />
          <Field label={t('Valuables left in the car')} value={f.valuables} onChange={e => set({ valuables: e.target.value })} />
          <Field label={t('Notes')} value={f.notes} onChange={e => set({ notes: e.target.value })} />
          <div className="row mt"><Btn onClick={save}>{t('Save inspection')}</Btn>{d.inspection?.by_name && <span className="mu small">{t('Inspected by')} {d.inspection.by_name} · {dt(d.inspection.updated)}</span>}</div>
        </> : d.inspection ? <>
          <p>{d.items.filter(k => d.inspection.items?.[k]).map(k => `${t(ITEMS[k])}: ${t({ ok: 'OK', attn: 'Problem', na: 'N/A' }[d.inspection.items[k]])}`).join(' · ') || '-'}</p>
          <p className="mu">{[d.inspection.fuel && `${t('Fuel level')} ${d.inspection.fuel}`, d.inspection.damage, d.inspection.valuables && `${t('Valuables left in the car')}: ${d.inspection.valuables}`, d.inspection.keys && `${t('Keys handed over')}: ${d.inspection.keys}`, d.inspection.notes].filter(Boolean).join(' · ')}</p>
        </> : null}

        <h3 className="mt">{t('photos')}</h3>
        {canEdit && <div className="row"><Field label={t('Photo type')}><select value={label} onChange={e => setLabel(e.target.value)}>{LABELS.map(x => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
          <label className="b" style={{ cursor: 'pointer' }}>{busy ? t('Uploading…') : t('Take or choose photos')}<input ref={pick} type="file" accept="image/*" capture="environment" multiple hidden disabled={busy} onChange={e => e.target.files.length && upload([...e.target.files])} /></label></div>}
        <div className="row mt" style={{ flexWrap: 'wrap', gap: 10 }}>{d.photos.length ? d.photos.map(p => <Thumb key={p.id} photo={p} onDelete={canDelete ? () => del(p) : null} />) : <span className="mu">{t('No photos yet.')}</span>}</div>
      </div>
    </details>
  );
}
