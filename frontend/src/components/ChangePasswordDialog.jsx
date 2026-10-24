import { useState } from 'react';
import { Btn, Dialog } from './ui.jsx';
import { api } from '../api.js';
import { useApp } from '../store.jsx';

// Everybody (every role) changes his own password here. The old password is asked first.
export default function ChangePasswordDialog({ onClose }) {
  const { say } = useApp();
  const [f, setF] = useState({ current: '', password: '', again: '' }), [shown, setShown] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setErr('');
    if (!f.current) return setErr('Write your current password.');
    if (f.password.length < 8) return setErr('The new password needs at least 8 characters.');
    if (f.password !== f.again) return setErr('The two new passwords are not the same.');
    setBusy(true);
    try { await api('/auth/password', 'POST', { current: f.current, password: f.password }); say('Your password was changed'); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const type = shown ? 'text' : 'password';
  return (
    <Dialog title="Change my password" onClose={onClose} actions={<><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Btn><Btn kind="ol" onClick={onClose}>Cancel</Btn></>}>
      <div className="g">
        <label>Current password<input type={type} autoComplete="current-password" value={f.current} onChange={set('current')} /></label>
        <label>New password (8+ characters)<input type={type} autoComplete="new-password" value={f.password} onChange={set('password')} /></label>
        <label>New password again<input type={type} autoComplete="new-password" value={f.again} onChange={set('again')} /></label>
        <label className="opt-r"><input type="checkbox" checked={shown} onChange={e => setShown(e.target.checked)} />Show the passwords</label>
        {err && <p role="alert" style={{ color: "#c0392b", fontWeight: 600 }}>{err}</p>}
        <p className="mu small">Keep it to yourself. If you forget it, the Manager can help you.</p>
      </div>
    </Dialog>
  );
}
