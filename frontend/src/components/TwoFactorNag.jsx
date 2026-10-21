import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { t } from '../lib/i18n.js';

// A reminder line for the Manager and the Administrator until two-step sign-in is switched on
export function TwoFactorNag({ go }) {
  const [on, setOn] = useState(true);
  useEffect(() => { api('/auth/2fa').then(d => setOn(d.on)).catch(() => {}); }, []);
  return on ? null : <div className="box" role="note" style={{ marginBottom: 8 }}>{t('Turn on two-step sign-in for your account (Staff screen).')} <button type="button" className="lnk" onClick={() => go('staff')}>{t('Staff')}</button></div>;
}
