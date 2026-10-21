import test from 'node:test';
import assert from 'node:assert/strict';
import { codeAt, newSecret, verifyTotp, otpauthUri } from '../totp.js';

test('matches the RFC 6238 test vector (secret 12345678901234567890, T=59)', () => {
  assert.equal(codeAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
});
test('accepts this and the neighbouring 30 s steps, refuses others and non-codes', () => {
  const s = newSecret(), now = 1_700_000_000_000, step = Math.floor(now / 30000);
  assert.equal(verifyTotp(s, codeAt(s, step), now), step);
  assert.equal(verifyTotp(s, codeAt(s, step - 1), now), step - 1);
  assert.equal(verifyTotp(s, codeAt(s, step + 5), now), null);
  assert.equal(verifyTotp(s, 'abcdef', now), null);
  assert.equal(verifyTotp(s, '', now), null);
});
test('the setup link carries the secret and the account', () => {
  assert.match(otpauthUri('ABC234', 'mgr1'), /^otpauth:\/\/totp\/MG%20Auto:mgr1\?secret=ABC234/);
});
