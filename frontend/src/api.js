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

// A picture from the server (it needs the sign-in header, so an <img src> cannot fetch it): returns an object URL for the picture
export async function apiBlobUrl(path) {
  const r = await fetch(BASE + '/api' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!r.ok) throw new Error('Cannot load the picture');
  return URL.createObjectURL(await r.blob());
}
// Send a picture as the request body
export async function apiUpload(path, blob) {
  let r;
  try { r = await fetch(BASE + '/api' + path, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', ...(token && { Authorization: 'Bearer ' + token }) }, body: blob }); }
  catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Upload failed'), { status: r.status });
  return d;
}
