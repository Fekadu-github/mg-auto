import { lang, setLang } from '../lib/i18n.js';

// Amharic / English switch (a reload redraws every screen in the other language)
export default function LangToggle({ className = '' }) {
  const next = lang === 'am' ? 'en' : 'am';
  return <button type="button" className={'b ol ' + className} onClick={() => setLang(next)} aria-label={next === 'am' ? 'አማርኛ' : 'English'} title={next === 'am' ? 'አማርኛ' : 'English'} style={{ minWidth: 44 }}>{next === 'am' ? 'አማ' : 'EN'}</button>;
}
