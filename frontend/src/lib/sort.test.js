import { describe, expect, it } from 'vitest';
import { nextSort, sortRows } from './sort.js';

const rows = [{ n: 'b', q: 10 }, { n: 'a', q: 2 }, { n: '', q: null }, { n: 'c', q: 33 }];
describe('sortRows', () => {
  it('sorts numbers as numbers and puts empty cells last in both directions', () => {
    expect(sortRows(rows, { key: 'q', dir: 'asc' }).map(r => r.q)).toEqual([2, 10, 33, null]);
    expect(sortRows(rows, { key: 'q', dir: 'desc' }).map(r => r.q)).toEqual([33, 10, 2, null]);
  });
  it('sorts text without caring about case and keeps the original order with no sort', () => {
    expect(sortRows(rows, { key: 'n', dir: 'asc' }).map(r => r.n)).toEqual(['a', 'b', 'c', '']);
    expect(sortRows(rows, null)).toBe(rows);
  });
  it('sorts "2" before "10" in text', () => {
    expect(sortRows([{ id: 'JC-10' }, { id: 'JC-2' }], { key: 'id', dir: 'asc' }).map(r => r.id)).toEqual(['JC-2', 'JC-10']);
  });
});
describe('nextSort', () => {
  it('goes up, down, then off', () => {
    const a = nextSort(null, 'n'), b = nextSort(a, 'n'), c = nextSort(b, 'n');
    expect([a.dir, b.dir, c]).toEqual(['asc', 'desc', null]);
    expect(nextSort(b, 'q')).toEqual({ key: 'q', dir: 'asc' });
  });
});
