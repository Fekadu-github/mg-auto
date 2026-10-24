import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_BOOK, missingPriceBook } from '../labour.seed.js';

test('price book: every line has a code, description, model group and hours; no repeats', () => {
  const keys = new Set();
  for (const [code, name, model, hours] of PRICE_BOOK) {
    assert.ok(code && name && model, `${code} is incomplete`);
    assert.ok(Number.isFinite(hours) && hours >= 0 && hours <= 999, `${code} hours`);
    const k = `${code}|${model}`.toLowerCase(); assert.ok(!keys.has(k), `${k} repeated`); keys.add(k);
  }
  assert.equal(PRICE_BOOK.length, 875);
});

test('price book: sections follow the code, and lines already there are left alone', () => {
  const all = missingPriceBook([]);
  assert.equal(all.length, PRICE_BOOK.length);
  assert.ok(all.filter(l => l.code.startsWith('ME-')).every(l => l.section === 'Mechanical Repairs'));
  assert.ok(all.filter(l => !l.code.startsWith('ME-')).every(l => l.section === 'Body & Paints'));
  const some = missingPriceBook([{ code: 'bp-br101a', model_grp: 'SUZUKI' }]);   // matching ignores case
  assert.equal(some.length, PRICE_BOOK.length - 1);
  assert.equal(missingPriceBook(PRICE_BOOK.map(([code, , model_grp]) => ({ code, model_grp }))).length, 0);
});
