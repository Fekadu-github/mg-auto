import { describe, expect, it } from 'vitest';
import { buildReport } from './customReport.js';

const cols = [{ key: 'code', label: 'Part number' }, { key: 'make', label: 'Make' }, { key: 'qty', label: 'Quantity', type: 'num' }, { key: 'value', label: 'Value', type: 'num' }];
const rows = [{ code: 'T-1', make: 'Toyota', qty: 5, value: 500 }, { code: 'S-1', make: 'Suzuki', qty: 2, value: 300 }, { code: 'T-2', make: 'Toyota', qty: 1, value: 50.5 }];

describe('user-defined report', () => {
  it('picks columns, filters and sorts', () => {
    const r = buildReport(rows, cols, { pick: ['code', 'qty'], filter: { col: 'make', op: '=', value: 'toyota' }, sort: 'qty', dir: 'desc' });
    expect(r.head).toEqual(['Part number', 'Quantity']); expect(r.rows).toEqual([['T-1', 5], ['T-2', 1]]); expect(r.numeric).toEqual([false, true]);
  });
  it('number filters compare as numbers and an empty filter keeps everything', () => {
    expect(buildReport(rows, cols, { filter: { col: 'value', op: '>', value: '100' } }).rows.map(r => r[0])).toEqual(['T-1', 'S-1']);
    expect(buildReport(rows, cols, { filter: { col: '', op: 'contains', value: 'suz' } }).rows.length).toBe(1);
    expect(buildReport(rows, cols, { filter: { col: 'make', op: 'contains', value: '' } }).rows.length).toBe(3);
  });
  it('groups with a count and totals of the number columns', () => {
    const r = buildReport(rows, cols, { group: 'make', sort: 'qty', dir: 'desc' });
    expect(r.head).toEqual(['Make', 'Count', 'Total quantity', 'Total value']);
    expect(r.rows).toEqual([['Toyota', 2, 6, 550.5], ['Suzuki', 1, 2, 300]]);
  });
});
