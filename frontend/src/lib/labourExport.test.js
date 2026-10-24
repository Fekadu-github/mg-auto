import { describe, expect, it } from 'vitest';
import { buildLabourPdf, labourRows, labourSummary, labourXlsxRows } from './labourExport.js';

const tasks = [
  { id: 1, code: 'ME-BR101', model_grp: 'Suzuki', task: '', name: 'ABS System, Diagnosis', section: 'Mechanical Repairs', hours: 5.25, price: 0 },
  { id: 2, code: 'BP-BR101A', model_grp: 'Suzuki', task: 'Apron', name: 'Repair - One Side', section: 'Body & Paints', hours: 2, price: 0 },
  { id: 3, code: 'BP-BR102', model_grp: '', task: 'Apron', name: 'Replace', section: 'Body & Paints', hours: 1, price: 900 }
];
const rates = { default: 350, 'Body & Paints': 400 };

describe('labour export', () => {
  it('prices a line by hours x section rate unless a fixed price is set', () => {
    const rows = labourRows(tasks, rates);
    expect(rows.map(r => r.cost)).toEqual([1837.5, 800, 900]);
    expect(rows[0].section).toBe('Mechanical Repairs');
  });
  it('summarises the registered list', () => {
    const s = labourSummary(labourRows(tasks, rates));
    expect(s.count).toBe(3); expect(s.hours).toBe(8.25); expect(s.cost).toBe(3537.5);
    expect(s.bySection.map(x => [x.code, x.count])).toEqual([['ME', 1], ['BP', 2]]);
  });
  it('makes excel rows with a header and totals', () => {
    const x = labourXlsxRows(labourRows(tasks, rates));
    expect(x[0][0]).toBe('No'); expect(x.length).toBe(1 + 3 + 1 + 1 + 2);
  });
  it('builds a valid pdf, also when empty and when long', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ ...tasks[i % 3], id: i, code: 'X' + i }));
    for (const t of [[], tasks, many]) {
      const b = buildLabourPdf(labourRows(t, rates));
      expect(String.fromCharCode(...b.slice(0, 5))).toBe('%PDF-');
    }
  });
});

describe('labour rate by make', () => {
  const byMake = { default: 350, 'Body & Paints': 400, Suzuki: 350, Toyota: 400, Others: 450 };
  it('prices a line by its make: Suzuki 350, Toyota 400, Others 450', () => {
    const t = (model_grp, section = 'Body & Paints') => ({ id: model_grp, code: 'BP-' + model_grp, model_grp, task: '', name: 'x', section, hours: 2, price: 0 });
    const cost = m => labourRows([t(m)], byMake)[0].cost;
    expect(cost('Suzuki')).toBe(700); expect(cost('Toyota (SEDAN)')).toBe(800); expect(cost('TOYOTA ( SUV)')).toBe(800); expect(cost('Others')).toBe(900);
    expect(labourRows([t('')], byMake)[0].cost).toBe(800);   // no model group: the section's rate
  });
});
