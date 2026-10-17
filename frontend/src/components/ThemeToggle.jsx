import { useState } from 'react';
import { getTheme, setTheme } from '../theme.js';

// A small sun / moon switch
export default function ThemeToggle({ className = '' }) {
  const [t, setT] = useState(getTheme());
  const flip = () => { const n = t === 'dark' ? 'light' : 'dark'; setTheme(n); setT(n); };
  return (
    <button type="button" className={'tt ' + className} onClick={flip} aria-label={t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={t === 'dark' ? 'Light theme' : 'Dark theme'}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {t === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />}
      </svg>
    </button>
  );
}
