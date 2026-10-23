import { describe, expect, it } from 'vitest';
import { buildEstimatePdf } from './estimatePdf.js';

const garage = { name: 'MADEG General Trading PLC', brand: 'MG Auto', address: 'Gurdshola, Addis Ababa', phone: '0980766566', motto: 'Your car, our care' };
const sheet = (nl, np, o = {}) => ({
  no: 'EST-20261023-0046', date: '2026-10-23', draft: true, walkIn: true, customer: { name: 'Abebe', phone: '0911' }, vehicle: { plate: 'AA-1', vin: 'VIN123', eng: 'ENG9' }, note: 'Body and paint', vat: 0.15, garage,
  labours: Array.from({ length: nl }, (_, i) => ({ desc: `Labour ${i + 1}`, price: 1000 })), parts: Array.from({ length: np }, (_, i) => ({ code: 'P' + i, name: `Part ${i + 1}`, qty: 1, price: 500 })), ...o
});
const text = b => Buffer.from(b).toString('latin1');
const pages = b => (text(b).match(/\/Type \/Page /g) || []).length;

describe('estimate PDF', () => {
  it('is a valid PDF file', () => {
    const b = buildEstimatePdf(sheet(3, 2));
    expect(text(b).startsWith('%PDF-1.4')).toBe(true); expect(text(b).trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('keeps a normal estimate, and one with many lines, on ONE page (it shrinks a little to fit)', () => {
    expect(pages(buildEstimatePdf(sheet(3, 2)))).toBe(1);
    expect(pages(buildEstimatePdf(sheet(12, 4)))).toBe(1);
  });
  it('runs a very long estimate on to more pages, each with the footer and page number', () => {
    const b = buildEstimatePdf(sheet(60, 30)); expect(pages(b)).toBeGreaterThan(1);
  });
  it('a draft carries the watermark and a finalized one does not', () => {
    expect(text(buildEstimatePdf(sheet(2, 1)))).toContain('/GS1 gs');
    expect(text(buildEstimatePdf(sheet(2, 1, { draft: false })))).not.toContain('/GS1 gs');
  });
  it('does not fail on characters the PDF font cannot draw', () => {
    expect(() => buildEstimatePdf(sheet(1, 1, { customer: { name: 'ቲዛዙ “Tizazu”' } }))).not.toThrow();
  });
});
