import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setToken, setExpiredHandler } from './api.js';
import { POLL_MS } from './lib/constants.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const EMPTY = { c: [], v: [], j: [], p: [], cfg: { vat: 0.15, labourRate: 350, garage: {} } };
const load = () => { try { const me = JSON.parse(localStorage.getItem('me') || 'null'), tok = localStorage.getItem('tok'); return me && tok ? { me, tok } : { me: null, tok: null }; } catch { return { me: null, tok: null }; } };
const save = (tok, me) => { try { tok ? (localStorage.setItem('tok', tok), localStorage.setItem('me', JSON.stringify(me))) : (localStorage.removeItem('tok'), localStorage.removeItem('me')); } catch { /* private mode: stay signed in for this tab only */ } };

export function AppProvider({ children }) {
  const [auth, setAuth] = useState(() => { const a = load(); setToken(a.tok); return a; });
  const [db, setDb] = useState(EMPTY), [users, setUsers] = useState([]);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);       // { text, id }
  const [modal, setModal] = useState(null);       // { type, ...props }
  const me = auth.me;
  const meRef = useRef(me); meRef.current = me;

  const say = useCallback(text => setToast({ text, id: Date.now() }), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 7000); return () => clearTimeout(t); }, [toast]);

  const signOut = useCallback(() => { setToken(null); save(null); setAuth({ me: null, tok: null }); setDb(EMPTY); setUsers([]); setModal(null); }, []);
  useEffect(() => setExpiredHandler(signOut), [signOut]);

  // Load everything the screens need. Safe to call often: it only replaces state when the answer arrived while still signed in.
  const refresh = useCallback(async () => {
    if (!meRef.current) return;
    const d = await api('/data');
    const u = meRef.current?.role === 'ADMIN' ? await api('/users') : [];
    if (meRef.current) { setDb(d); setUsers(u); setReady(true); }
  }, []);

  const signIn = useCallback(async (username, password) => {
    const d = await api('/auth/login', 'POST', { username, password });
    setToken(d.token); save(d.token, d.user); meRef.current = d.user; setAuth({ me: d.user, tok: d.token });
    await refresh();
  }, [refresh]);

  // first load, then every 15 s while the page is visible, and again when the person comes back to it
  useEffect(() => {
    if (!me) return;
    refresh().catch(e => say(e.message));
    const tick = () => { if (document.visibilityState === 'visible') refresh().catch(() => {}); };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [me, refresh, say]);

  // Run an action that changes data: show the error if it fails, otherwise reload the data. Returns { ok, data }.
  const run = useCallback(async fn => {
    try { const data = await fn(); await refresh().catch(() => {}); return { ok: true, data }; }
    catch (e) { say(e.message); return { ok: false }; }
  }, [refresh, say]);

  const value = useMemo(() => ({
    me, db, users, ready, toast, modal, say, run, refresh, signIn, signOut,
    openModal: (type, props) => setModal({ type, ...props }), closeModal: () => setModal(null), dismissToast: () => setToast(null),
    cust: id => db.c.find(x => x.id === id) || {}, veh: id => db.v.find(x => x.id === id) || {}, job: id => db.j.find(x => x.id === id)
  }), [me, db, users, ready, toast, modal, say, run, refresh, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
