import { describe, expect, it } from 'vitest';
import { invoiceLines, jobTotals, lastDoc, money, pct, snap, tot, vehicleName } from './format.js';

const job = { id: 'TC-1', labours: [{ id: 'L1', desc: 'Oil change', price: 700 }], parts: [{ name: 'Oil', code: 'OIL-001', qty: 2, price: 450 }], log: [] };

describe('totals', () => {
  it('adds VAT on labour plus parts', () => {
    expect(tot(job, 0.15)).toEqual({ l: 700, p: 900, sub: 1600, vat: 240, total: 1840, rate: 0.15 });
  });
  it('an issued invoice keeps its own amounts when the VAT rate changes later', () => {
    const doc = { type: 'Cash', totals: { labour: 700, parts: 900, sub: 1600, vat: 240, total: 1840, rate: 0.15 } };
    expect(snap(job, doc, 0.2).total).toBe(1840);
    expect(jobTotals({ ...job, inv: doc }, 0.2).vat).toBe(240);
    expect(jobTotals(job, 0.2).vat).toBe(320);   // no invoice yet: current rate
  });
});

describe('helpers', () => {
  it('formats money and percentages', () => { expect(money(1234.5)).toBe('1,234.50'); expect(money(null)).toBe('0.00'); expect(pct(0.15)).toBe(15); });
  it('joins brand and model', () => { expect(vehicleName({ brand: 'Toyota', model: 'Rav4' })).toBe('Toyota Rav4'); expect(vehicleName({ model: 'Rav4' })).toBe('Rav4'); });
  it('lists labour and parts as invoice lines', () => {
    const l = invoiceLines(job);
    expect(l.map(x => [x.kind, x.amount])).toEqual([['Labour', 700], ['Part', 900]]);
  });
  it('finds the last proforma in the log', () => {
    const j = { ...job, log: [{ doc: { type: 'Proforma', no: 'A' } }, { doc: { type: 'Proforma', no: 'B' } }] };
    expect(lastDoc(j, 'Proforma').no).toBe('B');
    expect(lastDoc(job, 'Proforma')).toBeUndefined();
  });
});
