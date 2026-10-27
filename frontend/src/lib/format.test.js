import { describe, expect, it } from 'vitest';
import { birrInWords, discNote, invoiceLines, jobTotals, lastDoc, money, pct, rateOf, snap, splitCode, tot, vehicleName } from './format.js';

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

describe('labour rate per section', () => {
  const rates = { default: 350, 'Body & Paints': 500 };
  it('uses the rate of the section, else the standard rate', () => {
    expect(rateOf(rates, 'Body & Paints')).toBe(500);
    expect(rateOf(rates, 'Regular Service')).toBe(350);
    expect(rateOf(rates, undefined)).toBe(350);
  });
  it('still accepts one number for every section', () => {
    expect(rateOf(300, 'Body & Paints')).toBe(300);
    expect(rateOf(undefined, 'x')).toBe(0);
  });
});

describe('estimation sheet helpers', () => {
  it('writes the amount in words like the sample estimate', () => {
    expect(birrInWords(30314)).toBe('Birr THIRTY THOUSAND THREE HUNDRED FOURTEEN AND 00/100 Only');
    expect(birrInWords(1250.5)).toBe('Birr ONE THOUSAND TWO HUNDRED FIFTY AND 50/100 Only');
    expect(birrInWords(0)).toBe('Birr ZERO AND 00/100 Only');
    expect(birrInWords(2000000.07)).toBe('Birr TWO MILLION AND 07/100 Only');
    expect(birrInWords(119)).toBe('Birr ONE HUNDRED NINETEEN AND 00/100 Only');
  });
  it('splits the price-book code out of a labour description', () => {
    expect(splitCode('Bumper, Repair - Front (BP-BR114B)')).toEqual({ code: 'BP-BR114B', text: 'Bumper, Repair - Front' });
    expect(splitCode('Oil change')).toEqual({ code: '', text: 'Oil change' });
    expect(splitCode('Wheel balance (front) ')).toEqual({ code: '', text: 'Wheel balance (front) ' });
  });
});

describe('referral discount', () => {
  const disc = { type: 'pct', value: 10, ref_cid: 'CUS-20261001-0003', ref_name: 'Abebe Kebede', ref_phone: '0911223344' };
  it('comes off the subtotal before VAT and keeps who referred the customer', () => {
    const t = tot({ labours: [{ price: 600 }], parts: [{ qty: 2, price: 200 }], disc }, 0.15);
    expect([t.sub, t.disc, t.vat, t.total]).toEqual([1000, 100, 135, 1035]);
    expect(t.discRef).toBe(disc);
  });
  it('an amount discount never takes the total below zero, and no discount adds no fields', () => {
    expect(tot({ labours: [{ price: 100 }], parts: [], disc: { type: 'amt', value: 500, ref_name: 'A', ref_phone: '1' } }, 0.15).total).toBe(0);
    expect('disc' in tot({ labours: [{ price: 100 }], parts: [] }, 0.15)).toBe(false);
  });
  it('an issued invoice keeps its frozen discount', () => {
    const t = snap({ labours: [], parts: [] }, { totals: { labour: 600, parts: 400, sub: 1000, disc: 100, discRef: disc, vat: 135, total: 1035, rate: 0.15 } }, 0.2);
    expect(t.disc).toBe(100); expect(t.total).toBe(1035);
  });
  it('states the person, the phone and the customer number', () => {
    const n = discNote(disc);
    expect(n).toContain('10% discount given because this customer referred Abebe Kebede'); expect(n).toContain('0911223344'); expect(n).toContain('customer no. CUS-20261001-0003');
    expect(discNote(null)).toBe('');
  });
});
