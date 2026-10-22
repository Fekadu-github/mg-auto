import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InvoiceDoc, { invoiceSize } from './InvoiceDoc.jsx';
import VoucherDoc from './VoucherDoc.jsx';
import ProformaDoc from './ProformaDoc.jsx';
import EstimateDoc from './EstimateDoc.jsx';

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
  it('a job from an insurance proforma is billed to the insurance company; otherwise to the customer', () => {
    const doc = { type: 'Cash', no: 'X', date: 0, totals }, a4 = { type: 'Proforma', no: 'Y', date: 0, totals };
    const ins = { ...props, job: { ...job, payer: 'Awash Insurance', policy_no: 'P-77' } };
    for (const d of [doc, a4]) {
      const html = renderToStaticMarkup(<InvoiceDoc {...ins} doc={d} />);
      expect(html).toContain('Awash Insurance'); expect(html).toContain('P-77'); expect(html).toContain('Abebe &lt;b&gt;Kebede&lt;/b&gt;');   // the owner is still named
    }
    const own = renderToStaticMarkup(<InvoiceDoc {...props} doc={doc} />);
    expect(own).not.toContain('Bill to'); expect(own).toContain('Abebe');
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

describe('Service Price Estimation sheet (ProformaDoc / EstimateDoc)', () => {
  const pro = {
    id: 'EST-20261021-0001', pdate: '2026-10-21', status: 'Issued', estimator: 'Tizazu', estimator_role: 'SA', policy_no: 'POL-1', claim_no: 'CLM-9', due_date: '2026-11-05', note: 'Front door', terms: '', 
    labours: [{ desc: 'Bumper, Repair - Front (BP-BR114B)', section: 'Body & Paints', price: 2100 }, { desc: 'Miscellaneous', section: 'Body & Paints', price: 1260 }],
    parts: [{ code: 'MP-101', name: 'Paint Material', qty: 5, price: 2500 }]
  };
  const insurer = { name: 'Awash Insurance', phone: '0111', address: 'Bole, Addis Ababa' };
  const render = el => renderToStaticMarkup(el);

  it('shows the insurance company with its address, policy and claim, the codes, the totals and the amount in words', () => {
    const html = render(<ProformaDoc pro={pro} customer={customer} vehicle={vehicle} insurer={insurer} vat={0.15} roleName={() => 'Service Advisor'} />);
    expect(html).toContain('Service Price Estimation'); expect(html).toContain('EST-20261021-0001'); expect(html).toContain('21/10/2026');
    expect(html).toContain('Awash Insurance'); expect(html).toContain('Bole, Addis Ababa'); expect(html).toContain('POL-1'); expect(html).toContain('CLM-9');
    expect(html).toContain('BP-BR114B'); expect(html).toContain('Total for Labour'); expect(html).toContain('Total for Other Charges');
    expect(html).toContain('Total Est. Amount'); expect(html).toContain('15% VAT'); expect(html).toContain('Total Inc. VAT');
    // labour 3,360 + paint 12,500 = 15,860; VAT 2,379; total 18,239
    expect(html).toContain('15,860.00'); expect(html).toContain('2,379.00'); expect(html).toContain('18,239.00');
    expect(html).toContain('EIGHTEEN THOUSAND TWO HUNDRED THIRTY NINE AND 00/100 Only');
    expect(html).toContain('Terms and Condition'); expect(html).toContain('Prepared by'); expect(html).toContain('Checked by'); expect(html).toContain('Approved by');
    expect(html).toContain('Tizazu'); expect(html).toContain('Service Advisor'); expect(html).not.toContain('est-chip'); expect(html).not.toContain('is-draft');
  });
  it('a walk-in customer without insurance is marked as such and keeps blank lines for the missing vehicle details', () => {
    const html = render(<ProformaDoc pro={{ ...pro, status: 'Draft', claim_no: '' }} walkIn customer={{ name: 'Walk In', phone: '0922' }} vehicle={{ plate: 'AA-1' }} />);
    expect(html).toContain('Walk-in customer (private)'); expect(html).toContain('Customer pays (no insurance)'); expect(html).toContain('>DRAFT</span>'); expect(html).toContain('is-draft');
    expect(html).toContain('Walk In'); expect(html).toContain('AA-1'); expect(html).not.toContain('Policy no'); expect(html).toContain('Chassis no');
  });
  it('prints the garage bank account and the custom remark when set, and escapes customer text', () => {
    const html = render(<ProformaDoc pro={{ ...pro, terms: 'Valid 15 days' }} customer={customer} vehicle={vehicle} garage={{ bank: 'CBE 1000123' }} />);
    expect(html).toContain('REMARK:'); expect(html).toContain('Valid 15 days'); expect(html).toContain('CBE 1000123');
    expect(html).not.toContain('<b>Kebede</b>'); expect(html).toContain('&lt;b&gt;Kebede');
    expect(render(<ProformaDoc pro={pro} customer={customer} vehicle={vehicle} />)).not.toContain('REMARK:');
  });
  it('an estimate uses the same sheet and takes the insurance details of the proforma it was made from', () => {
    const est = { id: 'EST-20261021-0002', status: 'Draft', created: Date.UTC(2026, 9, 21, 9), by_name: 'Almaz', note: 'x', labours: pro.labours, parts: pro.parts };
    const html = render(<EstimateDoc est={est} customer={customer} vehicle={vehicle} pro={pro} insurer={insurer} />);
    expect(html).toContain('Service Price Estimation'); expect(html).toContain('>DRAFT</span>'); expect(html).toContain('is-draft'); expect(html).toContain('EST-20261021-0002'); expect(html).toContain('Awash Insurance'); expect(html).toContain('Almaz');
  });
});
