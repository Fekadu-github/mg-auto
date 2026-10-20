import { describe, expect, it } from 'vitest';
import { searchEstimates, searchParts } from './search.js';

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

describe('searchEstimates', () => {
  const list = [{ id: 'EST-0012', note: 'Front bumper dent', cid: 'c1' }, { id: 'EST-0011', note: 'Rear door paint', cid: 'c2' }, { id: 'EST-0103', note: '', cid: null }];
  const who = e => ({ 'EST-0012': 'Abebe Kebede AA-12345', 'EST-0011': 'Sara Tesfaye 3-98765', 'EST-0103': 'Walk-in Dawit' })[e.id];
  const ids = t => searchEstimates(list, t, who).map(e => e.id);
  it('one letter lists every estimate, newest first as given', () => expect(ids('e')).toEqual(['EST-0012', 'EST-0011', 'EST-0103']));
  it('finds by number without the zeros', () => { expect(ids('12')).toEqual(['EST-0012']); expect(ids('103')).toEqual(['EST-0103']); });
  it('finds by customer, plate or damage note', () => { expect(ids('abe')).toEqual(['EST-0012']); expect(ids('rear')).toEqual(['EST-0011']); expect(ids('dawit')).toEqual(['EST-0103']); });
  it('finds nothing for unknown text', () => expect(ids('zzz')).toEqual([]));
});
