import { describe, expect, it } from 'vitest';
import { estimateRows } from './estimateExport.js';

const est = { id: 'EST-1', status: 'Draft', note: 'Front bumper', created: '2026-10-20T08:00:00Z', labours: [{ desc: 'Paint bumper', section: 'Body & Paints', hours: '2', price: '1000' }], parts: [{ code: 'B1', name: 'Bumper', qty: '2', price: '500' }] };

describe('estimateRows', () => {
  it('lists every line and totals with VAT, for a draft', () => {
    const rows = estimateRows(est, { customer: { name: 'Abebe' }, vehicle: { plate: 'AA1', brand: 'MG' }, vat: 0.15 });
    expect(rows[0]).toEqual(['Estimate EST-1', 'Draft']);
    const head = rows.findIndex(r => r[0] === '#');
    expect(rows[head + 1].slice(1, 3)).toEqual(['Paint bumper', 'Labour BP']);
    expect(rows[head + 2][6]).toBe(1000);
    expect(rows.at(-1)).toEqual(['', '', '', '', '', 'Total (ETB)', 2300]);
  });
  it('shows who finalized a finalized estimate', () => {
    const rows = estimateRows({ ...est, status: 'Finalized', finalized_at: '2026-10-20T09:00:00Z', by_name: 'Sara', labours: [], parts: [] });
    expect(rows.some(r => r[0] === 'Finalized' && r[1].includes('Sara'))).toBe(true);
  });
});
