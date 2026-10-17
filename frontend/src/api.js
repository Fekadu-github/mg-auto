// Talks to the Node API. VITE_API_URL is the API address; empty means "same site" (dev proxy, or the API serves the app).
const BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');

let token = null, onExpired = () => {};
export const setToken = t => { token = t; };
export const setExpiredHandler = f => { onExpired = f; };

export async function api(path, method = 'GET', body) {
  let r;
  try {
    r = await fetch(BASE + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { onExpired(); throw new Error('Session expired. Sign in again.'); }
  if (!r.ok) throw Object.assign(new Error(d.error || 'Request failed'), { status: r.status });
  return d;
}
