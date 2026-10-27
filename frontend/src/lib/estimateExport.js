import { dt, tot, vehicleName, cur, discNote } from './format.js';
import { SECTION_CODE } from './constants.js';

const num = v => parseFloat(v) || 0;

/** The rows of the Excel file for one estimate (draft or finalized). Plain function, so it is easy to test.
 *  est: { id, status, note, created, finalized_at, by_name, used_in, labours, parts } */
export function estimateRows(est, { customer: c = {}, vehicle: v = {}, vat = 0.15 } = {}) {
  const labours = est.labours.map(l => ({ ...l, price: num(l.price) })), parts = est.parts.map(p => ({ ...p, qty: num(p.qty), price: num(p.price) }));
  const t = tot({ labours, parts, disc: est.disc }, vat);
  let n = 0;
  return [
    [`Estimate ${est.id}`, est.status],
    ['Made', dt(est.created)],
    ...(est.status !== 'Draft' && est.finalized_at ? [['Finalized', `${dt(est.finalized_at)}${est.by_name ? ` by ${est.by_name}` : ''}`]] : []),
    ...(est.used_in ? [['Loaded on', est.used_in]] : []),
    ['Customer', [c.name, c.id, c.phone].filter(Boolean).join(' · ')],
    ['Vehicle', [v.plate, vehicleName(v)].filter(Boolean).join(' · ')],
    ...(est.note ? [['Damage / work', est.note]] : []),
    [],
    ['#', 'Description', 'Type', 'Hours', 'Qty', 'Unit price', `Amount (${cur()})`],
    ...labours.map(l => [++n, l.desc, `Labour ${SECTION_CODE[l.section] || ''}`.trim(), num(l.hours) || '', 1, l.price, l.price]),
    ...parts.map(p => [++n, `${p.code ? p.code + ' ' : ''}${p.name}`, 'Part', '', p.qty, p.price, Math.round(p.qty * p.price * 100) / 100]),
    [],
    ['', '', '', '', '', 'Labour', t.l], ['', '', '', '', '', 'Parts', t.p], ['', '', '', '', '', 'Subtotal', t.sub],
    ...(t.disc ? [['', '', '', '', '', 'Referral discount', -t.disc], ['', '', '', '', '', 'Reason', discNote(t.discRef)]] : []),
    ['', '', '', '', '', `VAT ${Math.round(t.rate * 1000) / 10}%`, t.vat], ['', '', '', '', '', `Total (${cur()})`, t.total]
  ];
}
