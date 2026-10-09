import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InvoiceDoc, { invoiceSize } from './InvoiceDoc.jsx';
import VoucherDoc from './VoucherDoc.jsx';

const job = {
  id: 'TC-20261009-0001', status: 'Delivered',
  labours: [{ id: 'L1', desc: 'Oil change', section: 'Regular Service', price: 700 }],
  parts: [{ code: 'OIL-001', name: 'Engine Oil 15W-40', qty: 2, price: 450 }],
  inv: null, log: [{ s: 'Delivered', t: Date.UTC(2026, 9, 9, 9, 0), by: 'Almaz' }]
};
const totals = { labour: 700, parts: 900, sub: 1600, vat: 240, total: 1840, rate: 0.15 };
const customer = { id: 'CUS-20261009-0001', name: 'Abebe <b>Kebede</b>', phone: '0911223344', city: 'Addis Ababa', sub: 'Bole' };
const vehicle = { plate: 'AA-12345', brand: 'Toyota', model: 'Rav4', vin: 'VIN123', eng: 'ENG9', col: 'White' };
const props = { job, customer, vehicle, garage: { phone: '0980766566' }, vat: 0.15 };

describe('InvoiceDoc', () => {
  it('proforma is an A4 quotation with every line and the VAT breakdown', () => {
    const doc = { type: 'Proforma', no: 'INV-20261009-0002', date: Date.UTC(2026, 9, 9), totals };
    const html = renderToStaticMarkup(<InvoiceDoc {...props} doc={doc} />);
    expect(invoiceSize(doc)).toBe('a4');
    expect(html).toContain('PROFORMA INVOICE'); expect(html).toContain('INV-20261009-0002');
    expect(html).toContain('Oil change'); expect(html).toContain('OIL-001'); expect(html).toContain('VAT 15%'); expect(html).toContain('1,840.00');
    expect(html).toContain('not a tax invoice');
  });
  it('cash invoice is an 80 mm receipt marked as paid', () => {
    const doc = { type: 'Cash', no: 'INV-20261009-0003', date: Date.UTC(2026, 9, 9), totals };
    const html = renderToStaticMarkup(<InvoiceDoc {...props} doc={doc} />);
    expect(invoiceSize(doc)).toBe('pos');
    expect(html).toContain('CASH INVOICE'); expect(html).toContain('PAID IN CASH'); expect(html).not.toContain('Customer signature');
  });
  it('credit invoice says payment is still due and has a signature line', () => {
    const doc = { type: 'Credit', no: 'INV-20261009-0004', date: Date.UTC(2026, 9, 9), totals };
    const html = renderToStaticMarkup(<InvoiceDoc {...props} doc={doc} />);
    expect(html).toContain('PAYMENT STILL DUE'); expect(html).toContain('Customer signature');
  });
  it('prints the frozen amounts, not today\'s VAT rate', () => {
    const doc = { type: 'Cash', no: 'X', date: 0, totals };
    expect(renderToStaticMarkup(<InvoiceDoc {...props} doc={doc} vat={0.5} />)).toContain('1,840.00');
  });
  it('escapes customer text', () => {
    const doc = { type: 'Cash', no: 'X', date: 0, totals };
    const html = renderToStaticMarkup(<InvoiceDoc {...props} doc={doc} />);
    expect(html).not.toContain('<b>Kebede</b>'); expect(html).toContain('&lt;b&gt;Kebede');
  });
});

describe('VoucherDoc', () => {
  it('lists the work, the parts and both signature blocks', () => {
    const html = renderToStaticMarkup(<VoucherDoc {...props} job={{ ...job, inv: { no: 'INV-20261009-0003' } }} />);
    expect(html).toContain('VEHICLE DELIVERY VOUCHER'); expect(html).toContain('Oil change'); expect(html).toContain('Engine Oil 15W-40');
    expect(html).toContain('INV-20261009-0003'); expect(html).toContain('Service Advisor: Almaz'); expect(html).toContain('Received by');
  });
  it('omits the parts table when no parts were fitted', () => {
    expect(renderToStaticMarkup(<VoucherDoc {...props} job={{ ...job, parts: [] }} />)).not.toContain('Parts fitted');
  });
});
