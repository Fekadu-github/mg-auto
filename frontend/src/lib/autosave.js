// Nothing typed is lost. Every change is copied to this device at once (it survives a power cut or a closed tab) and saved to the server a moment later.
// The copy is removed when the server has it. If the server could not be reached, the copy stays, the screen says so and it tries again.
import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = id => 'mg-draft:' + id;
export function readDraft(id) {
  try { const d = JSON.parse(localStorage.getItem(KEY(id))); return d && d.v !== undefined ? d : null; } catch { return null; }
}
const writeDraft = (id, v) => { try { localStorage.setItem(KEY(id), JSON.stringify({ t: Date.now(), v })); } catch { /* storage full or blocked: the server save still happens */ } };
export const clearDraft = id => { try { localStorage.removeItem(KEY(id)); } catch { /* ignore */ } };

// What to open with: the copy kept on this device (changes the server may not have), otherwise what the server has.
// `serverAt` (ms, optional) is when the server's copy was last saved. A copy on this device older than that is out of date (the same document was
// changed from another PC after this device's last edit): it is dropped and the server's version is opened.
export function restoreDraft(id, fromServer, serverAt) {
  const d = readDraft(id);
  if (d && serverAt && Number.isFinite(serverAt) && d.t < serverAt) { clearDraft(id); return { value: fromServer, restored: false, replaced: true }; }
  return d ? { value: d.v, restored: true } : { value: fromServer, restored: false };
}

// Auto-save a value. save(value) must throw when it fails. flush() saves now and says whether the server has everything. Pass startDirty when the value was restored from this device (the server does not have it yet).
export function useAutosave(id, value, { save, enabled = true, startDirty = false, delay = 1200 }) {
  const json = JSON.stringify(value);
  const [state, setState] = useState({ s: 'idle' });
  const latest = useRef({ value, json, save });
  latest.current = { value, json, save };
  const onServer = useRef(startDirty ? null : json);   // the JSON the server is known to have
  const timer = useRef(0), busy = useRef(false);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (busy.current) return false;                     // the running save looks again when it ends
    const { value: v, json: j, save: doSave } = latest.current;
    if (j === onServer.current) return true;
    busy.current = true; setState({ s: 'saving' });
    try {
      await doSave(v);
      onServer.current = j;
      if (latest.current.json === j) clearDraft(id);
      setState({ s: 'saved', at: Date.now() });
    } catch (e) {
      busy.current = false; setState({ s: 'error', msg: e.message });
      timer.current = setTimeout(flush, 5000);          // try again
      return false;
    }
    busy.current = false;
    if (latest.current.json !== onServer.current) timer.current = setTimeout(flush, 300);   // typed while saving
    return true;
  }, [id]);

  useEffect(() => {
    if (!enabled || json === onServer.current) return undefined;
    writeDraft(id, latest.current.value);
    clearTimeout(timer.current); timer.current = setTimeout(flush, delay);
    return () => clearTimeout(timer.current);
  }, [json, enabled, id, flush, delay]);
  useEffect(() => () => { flush(); }, [flush]);        // closing the screen saves what is waiting
  return { state, flush };
}

// A form whose half-typed content is kept on this device until it is submitted (reset clears it). key = null: not kept (plain form).
export function usePersistedForm(key, initial) {
  const [v, setV] = useState(() => { if (!key) return initial; const d = readDraft(key); return d && typeof d.v === 'object' ? { ...initial, ...d.v } : initial; });
  const empty = JSON.stringify(v) === JSON.stringify(initial);
  useEffect(() => { if (!key) return; if (empty) clearDraft(key); else writeDraft(key, v); }, [v, empty, key]);
  const bind = k => ({ value: v[k] ?? '', onChange: e => setV(s => ({ ...s, [k]: e.target.value })) });
  return [v, bind, patch => setV(s => ({ ...s, ...patch })), () => { setV(initial); if (key) clearDraft(key); }];
}

// Like useState, but the value is kept on this device until it goes back to `initial` (the sale is completed, the GRN saved, "Start over" pressed).
// For work that has no server draft yet, such as the point-of-sale cart or a GRN being typed. Returns [value, setValue, restored]; key = null: not kept.
export function usePersistedState(key, initial) {
  const [v, setV] = useState(() => { if (!key) return initial; const d = readDraft(key); return d && d.v !== undefined ? d.v : initial; });
  const empty = JSON.stringify(v) === JSON.stringify(initial);
  const restored = useRef(!!key && !empty).current;   // true when the first value came from this device
  useEffect(() => { if (!key) return; if (empty) clearDraft(key); else writeDraft(key, v); }, [v, empty, key]);
  return [v, setV, restored];
}
