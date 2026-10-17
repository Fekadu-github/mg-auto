import { describe, expect, it } from 'vitest';
import { exportRows, lowParts, makeOf, parseCsv, priceFromCost } from './stock.js';

describe('stock helpers', () => {
  it('the part number letter tells the make', () => {
    expect(makeOf('t-100')).toBe('Toyota'); expect(makeOf('S9')).toBe('Suzuki'); expect(makeOf('B-1')).toBe('BYD'); expect(makeOf('X-1')).toBe(''); expect(makeOf('')).toBe('');
  });
  it('the price is the cost x 1.3', () => {
    expect(priceFromCost(100)).toBe(130); expect(priceFromCost('33.33')).toBe(43.33); expect(priceFromCost('')).toBe(0); expect(priceFromCost(100, 1.5)).toBe(150);
  });
  it('low stock lists out-of-stock parts first', () => {
    const l = lowParts([{ id: 1, code: 'B', stock: 1, reorder: 2 }, { id: 2, code: 'A', stock: 5, reorder: 2 }, { id: 3, code: 'C', stock: 0, reorder: 0 }]);
    expect(l.map(p => p.id)).toEqual([3, 1]);
  });
  it('the export has the headers the import reads, sorted by part number', () => {
    const rows = exportRows([{ code: 'T-2', name: 'b', stock: 1, cost: 10, price: 13, reorder: 1 }, { code: 'S-1', name: 'a', stock: 2, cost: 5, price: 6.5, reorder: 0, category: 'Brakes' }]);
    expect(rows[0]).toEqual(['Part number', 'Description', 'Make', 'Category', 'Quantity', 'Cost', 'Price', 'Reorder level']);
    expect(rows[1]).toEqual(['S-1', 'a', 'Suzuki', 'Brakes', 2, 5, 6.5, 0]); expect(rows[2][0]).toBe('T-2');
  });
  it('reads a CSV with quotes and numbers', () => {
    expect(parseCsv('Part number,Description,Qty,Cost\r\nT-1,"Oil, filter",10,"1,200"\n')).toEqual([['Part number', 'Description', 'Qty', 'Cost'], ['T-1', 'Oil, filter', 10, 1200]]);
  });
});
