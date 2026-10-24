// Money, dates and the totals of a job card. Plain functions, no React, so they are easy to test.
export const TZ = 'Africa/Addis_Ababa';

export const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
// The currency shown next to prices: set by the manager (Staff screen), loaded with the rest of the settings
let CUR = 'ETB';
export const cur = () => CUR;
export const setCurrency = c => { if (c) CUR = String(c); };
export const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Dates always show Addis Ababa time, whatever the device clock is set to
export const dt = t => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }) : '');
export const dtDate = t => (t ? new Date(t).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: TZ }) : '');
export const today = (now = Date.now()) => new Date(now + 3 * 36e5).toISOString().slice(0, 10);   // Addis Ababa date

export const vehicleName = v => [v?.brand, v?.model].filter(Boolean).join(' ');
export const pct = rate => Math.round(rate * 1000) / 10;
// Labour rate (ETB per hour): one number, or { default, 'Regular Service': 300, ... } (same rule as backend/rules.js)
// The price book's model group says the make (Suzuki, Toyota, Others); each make has its own rate, then the section's, then the standard rate.
export const makeOf = g => { const s = String(g ?? '').trim().toLowerCase(); return !s ? '' : s.includes('toyota') ? 'Toyota' : s.includes('suzuki') ? 'Suzuki' : 'Others'; };
export const MAKES = ['Suzuki', 'Toyota', 'Others'];
export const rateOf = (rate, section, model) => {
  if (rate && typeof rate === 'object') { const m = makeOf(model), r = Number((m ? rate[m] : undefined) ?? rate[section] ?? rate.default); return r >= 0 ? r : 0; }
  return Number(rate) >= 0 ? Number(rate) : 0;
};

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

// Odometer reading: 12345 -> "12,345 km"
export const km = n => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US') + ' km');

// The stock part a typed text points to: its code, or "code · name" as the part list shows it
const key = s => (s || '').trim().toLowerCase();
export const matchPart = (stock, text) => (key(text) ? (stock || []).find(x => key(`${x.code} · ${x.name}`) === key(text) || key(x.code) === key(text)) : undefined);

// "30314" -> "THIRTY THOUSAND THREE HUNDRED FOURTEEN"; used for the amount in words on estimates and proformas
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const below1000 = n => [n >= 100 && `${ONES[Math.floor(n / 100)]} HUNDRED`, n % 100 >= 20 ? `${TENS[Math.floor((n % 100) / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}` : ONES[n % 100]].filter(Boolean).join(' ');
export function wordsOf(n) {
  n = Math.floor(Math.abs(n));
  if (!n) return 'ZERO';
  return [[1e9, 'BILLION'], [1e6, 'MILLION'], [1e3, 'THOUSAND'], [1, '']].map(([u, name]) => {
    const part = Math.floor(n / u) % 1000;
    return part ? `${below1000(part)}${name ? ' ' + name : ''}` : '';
  }).filter(Boolean).join(' ');
}
// 30314 -> "Birr THIRTY THOUSAND THREE HUNDRED FOURTEEN AND 00/100 Only"
export function birrInWords(amount) {
  const cents = Math.round((Math.abs(Number(amount) || 0) + Number.EPSILON) * 100), birr = Math.floor(cents / 100);
  return `Birr ${wordsOf(birr)} AND ${String(cents % 100).padStart(2, '0')}/100 Only`;
}

// A labour line picked from the price book is stored as "Description (BP-BR114B)": split the code out so it can have its own column
export function splitCode(desc) {
  const m = /^(.*?)\s*\(([A-Z]{2}-[A-Z0-9.-]+)\)\s*$/.exec(String(desc || ''));
  return m ? { code: m[2], text: m[1] } : { code: '', text: String(desc || '') };
}
