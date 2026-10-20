import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImport } from '../services.js';

const S = ['Regular Service', 'Mechanical Repairs', 'Body & Paints'];

test('import takes BP and ME by code, only code / description / model group / hours, and never a cost', () => {
  const { lines, skipped, ignored } = normalizeImport([
    ['BP-BR101A', 'Apron, Repair - One Side', 'Suzuki', 2, 312, 624, 350, 700],
    ['ME-BR101', 'ABS System, Diagnosis', 'Toyota (SEDAN)', '5.25', 312, 1638],
    ['BP-BR101A', 'Apron, Repair - One Side', 'Toyota (SEDAN)', 2.5]
  ], S);
  assert.equal(skipped.length, 0);
  assert.deepEqual(lines.map(l => [l.code, l.name, l.model_grp, l.section, l.hours, l.price]), [
    ['BP-BR101A', 'Apron, Repair - One Side', 'Suzuki', 'Body & Paints', 2, 0],
    ['ME-BR101', 'ABS System, Diagnosis', 'Toyota (SEDAN)', 'Mechanical Repairs', 5.25, 0],
    ['BP-BR101A', 'Apron, Repair - One Side', 'Toyota (SEDAN)', 'Body & Paints', 2.5, 0]
  ]);
  assert.equal(ignored.duplicate, 0);
});

test('import leaves SV and other codes out, counts repeats from other sheets, and says why a BP/ME row without hours was skipped', () => {
  const { lines, skipped, ignored } = normalizeImport([
    ['Labour Code', 'Labour Type Description', 'Model  Grp'], ['SV-001', 'Oil change', 'Suzuki', 1], ['431A', 'Paint Deck Assy', 'Suzuki', 6],
    ['BP-BR114A', 'Bumper, Repair - Front', 'Suzuki', 3], ['BP-BR114A', 'Bumper, Repair - Front', 'Suzuki', 3], ['ME-X1', 'No hours', 'Suzuki']
  ], S);
  assert.equal(lines.length, 1);
  assert.deepEqual(ignored, { sv: 1, other: 2, duplicate: 1 });
  assert.equal(skipped.length, 1);
});

test('a row without a model group still reads its hours', () => {
  const { lines } = normalizeImport([['ME-Z9', 'Wheel alignment', 1.5]], S);
  assert.deepEqual([lines[0].model_grp, lines[0].hours], ['', 1.5]);
});
