// Money, dates and the totals of a job card. Plain functions, no React, so they are easy to test.
export const TZ = 'Africa/Addis_Ababa';

export const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Dates always show Addis Ababa time, whatever the device clock is set to
export const dt = t => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }) : '');
export const dtDate = t => (t ? new Date(t).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: TZ }) : '');
export const today = (now = Date.now()) => new Date(now + 3 * 36e5).toISOString().slice(0, 10);   // Addis Ababa date

export const vehicleName = v => [v?.brand, v?.model].filter(Boolean).join(' ');
export const pct = rate => Math.round(rate * 1000) / 10;

// Totals at a VAT rate (a fraction, 0.15 = 15%). Same arithmetic as the server.
export function tot(j, rate) {
  const l = r2(j.labours.reduce((s, x) => s + x.price, 0)), p = r2(j.parts.reduce((s, x) => s + x.qty * x.price, 0));
  const sub = r2(l + p), vat = r2(sub * rate);
  return { l, p, sub, vat, total: r2(sub + vat), rate };
}
// Issued documents keep the amounts they were issued with, so a later VAT change never alters them
export function snap(j, doc, rate) {
  const t = doc && doc.totals;
  return t ? { l: t.labour, p: t.parts, sub: t.sub, vat: t.vat, total: t.total, rate: t.rate } : tot(j, rate);
}
// The amounts to show for a job card: the invoice's frozen amounts once there is one
export const jobTotals = (j, rate) => snap(j, j.inv, rate);

export const activeClock = l => (l.logs || []).find(x => !x.out);
export const labourHours = (l, now = Date.now()) => (l.logs || []).reduce((s, x) => s + ((x.out || now) - x.in), 0) / 36e5;

// The lines printed on an invoice: every labour is one line, every part is qty x unit price
export function invoiceLines(j) {
  return [
    ...j.labours.map(l => ({ kind: 'Labour', code: '', desc: l.desc, qty: 1, unit: l.price, amount: l.price })),
    ...j.parts.map(p => ({ kind: 'Part', code: p.code || '', desc: p.name, qty: p.qty, unit: p.price, amount: r2(p.qty * p.price) }))
  ];
}

// The proforma that was printed last (a proforma does not change the card's status, so it lives in the log)
export const lastDoc = (j, type) => [...(j.log || [])].reverse().find(x => x.doc && x.doc.type === type)?.doc;

export function downloadCsv(name, rows) {
  const f = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const b = new Blob(['﻿' + rows.map(r => r.map(f).join(',')).join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
