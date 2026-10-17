import { describe, expect, it } from 'vitest';
import { searchParts } from './search.js';

const stock = [
  { id: 1, code: 'TBRK-001', name: 'Brake Pad Set' }, { id: 2, code: 'SBRK-002', name: 'Brake Disc' }, { id: 3, code: 'BSUS-001', name: 'Shock Absorber' },
  { id: 4, code: 'SOIL-001', name: 'Engine Oil 15W-40' }, { id: 5, code: 'T-77', name: 'Oil Filter' }
];
describe('searchParts', () => {
  it('finds by part number or by words of the description, in any order', () => {
    expect(searchParts(stock, 'tbrk').map(p => p.id)).toEqual([1]);
    expect(searchParts(stock, 'pad brake').map(p => p.id)).toEqual([1]);
    expect(searchParts(stock, 'oil').map(p => p.id)).toEqual([4, 5]);
    expect(searchParts(stock, 'OIL FILTER').map(p => p.id)).toEqual([5]);
  });
  it('part numbers that start with the text come first; empty text finds nothing', () => {
    expect(searchParts(stock, '-00').map(p => p.id)).toEqual([3, 2, 4, 1]);
    expect(searchParts(stock, '  ')).toEqual([]); expect(searchParts(stock, 'zzz')).toEqual([]); expect(searchParts(null, 'a')).toEqual([]);
  });
  it('limits the list', () => { expect(searchParts(stock, '-', 2)).toHaveLength(2); });
});
