// Passwords the Manager may read back (so he can help a person who forgot hers).
// Sign-in still checks the bcrypt hash (pass_hash). In addition, the password is kept ENCRYPTED (AES-256-GCM) in pass_enc.
// The key comes from PASSWORD_KEY (or, when that is not set, from JWT_SECRET), so a copy of the database alone shows nothing.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const keyOf = secret => createHash('sha256').update('mg-auto-pass-view|' + String(secret || '')).digest();

export function encryptPassword(plain, secret) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

// Returns the password, or null when nothing is stored / the key changed / the value was tampered with.
export function decryptPassword(enc, secret) {
  try {
    const [v, iv, tag, ct] = String(enc || '').split(':');
    if (v !== 'v1' || !ct) return null;
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch { return null; }
}
