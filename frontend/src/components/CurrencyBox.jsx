import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Btn, Field } from './ui.jsx';
import { t } from '../lib/i18n.js';
import { cur } from '../lib/format.js';

// Manager: the currency code printed next to every price
export default function CurrencyBox() {
  const { run, refresh, say } = useApp();
  const [code, setCode] = useState(cur());
  const save = async () => { const r = await run(() => api('/settings/currency', 'PUT', { code })); if (r.ok) { await refresh(); say(t('Currency saved.')); } };
  return (
    <div className="box mt"><h3>{t('Currency')}</h3>
      <div className="row"><Field label={t('Currency code')} value={code} maxLength={8} onChange={e => setCode(e.target.value.toUpperCase())} /><Btn onClick={save} disabled={!code.trim()}>{t('Save')}</Btn></div>
      <p className="mu small">{t('Shown on every price, estimate, invoice and report. For example ETB or USD.')}</p>
    </div>
  );
}
