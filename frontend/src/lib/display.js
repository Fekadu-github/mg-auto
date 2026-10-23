// How the screen looks, kept on this device: row spacing, accent colour and a high-contrast option. (Light / dark is in theme.js.)
const KEY = 'mg_display';
export const DENSITIES = [['comfortable', 'Comfortable'], ['compact', 'Compact']];
export const ACCENTS = [['blue', 'Blue'], ['teal', 'Teal'], ['orange', 'Orange'], ['violet', 'Violet']];
const DEFAULTS = { density: 'comfortable', accent: 'blue', contrast: false };
export function getDisplay() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...(DENSITIES.some(d => d[0] === v.density) && { density: v.density }), ...(ACCENTS.some(a => a[0] === v.accent) && { accent: v.accent }), ...(v.contrast === true && { contrast: true }) }; }
  catch { return { ...DEFAULTS }; }
}
export function applyDisplay(d = getDisplay()) {
  const el = typeof document !== 'undefined' && document.documentElement; if (!el) return d;
  el.setAttribute('data-density', d.density); el.setAttribute('data-accent', d.accent); el.setAttribute('data-contrast', d.contrast ? 'high' : 'normal');
  return d;
}
export function setDisplay(patch) {
  const d = { ...getDisplay(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: applies until the page is closed */ }
  return applyDisplay(d);
}
