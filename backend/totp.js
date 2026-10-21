// Two-step sign-in codes (TOTP, RFC 6238: the 6-digit code that Google Authenticator, Microsoft Authenticator or Authy show). No extra package.
import { createHmac, randomBytes } from 'node:crypto';

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const newSecret = () => { let bits = '', out = ''; for (const b of randomBytes(20)) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const decode = s => { let bits = ''; for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) { const i = A.indexOf(ch); if (i < 0) return null; bits += i.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };

export function codeAt(secret, step) {
  const key = decode(secret); if (!key) return null;
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', key).update(msg).digest(), o = h[h.length - 1] & 15;
  return String(((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, '0');
}
// The step number whose code matches (one step either side allowed for clock drift), or null
export function verifyTotp(secret, code, now = Date.now()) {
  const c = String(code || '').replace(/\s/g, ''), cur = Math.floor(now / 30000);
  if (!/^\d{6}$/.test(c) || !secret) return null;
  for (const d of [0, -1, 1]) if (codeAt(secret, cur + d) === c) return cur + d;
  return null;
}
export const otpauthUri = (secret, user, issuer = 'MG Auto') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
