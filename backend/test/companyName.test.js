import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, garageName, COMPANY_NAME } from '../config.js';

test('the printed company name is the full legal name, even when the host still has an old GARAGE_NAME', () => {
  assert.equal(COMPANY_NAME, 'MADEG General Trading PLC');
  assert.equal(loadConfig({}).garage.name, COMPANY_NAME);
  for (const old of ['MADEG — MG Auto', 'MADEG — MG Auto Plc', 'MADEG - MG Auto PLC', 'MADEG-MG AUTO PLC', 'MG Auto', 'MG Auto Plc', '  mg-auto plc ', ''])
    assert.equal(loadConfig({ GARAGE_NAME: old }).garage.name, COMPANY_NAME, JSON.stringify(old));
});

test('a different company name typed by the owner is kept', () => {
  assert.equal(garageName('Another Garage PLC'), 'Another Garage PLC');
  assert.equal(garageName('MADEG General Trading PLC'), 'MADEG General Trading PLC');
});
