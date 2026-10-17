// Light / dark theme: the saved choice, else the device setting. index.html sets it before the first paint (no flash).
const KEY = 'mg_theme';
export const getTheme = () => document.documentElement.getAttribute('data-theme') || 'dark';
export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch { /* private mode: applies to this tab only */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#eef2fb' : '#070b14');
}
