// npm run seed: add the 4 starter parts from the MG Auto V3 prototype. Safe to repeat: a part whose code exists is skipped.
import { createDb, newId, adjustStock } from '../db.js';

export const PARTS = [
  ['OIL-001', 'Engine Oil 15W-40', 450, 100], ['FLT-001', 'Oil Filter', 350, 30],
  ['BRK-001', 'Brake Pad Set', 2500, 20], ['SUS-001', 'Shock Absorber', 4200, 16]
];
const db = createDb();
await db.migrate();
let added = 0;
for (const [code, name, price, stock] of PARTS) {
  await db.tx(async c => {
    if ((await c.q('SELECT id FROM inventory WHERE code = ?', [code])).length) return;
    const id = newId();
    await c.q('INSERT INTO inventory (id, code, name, price, stock, reorder, active, created_at) VALUES (?,?,?,?,0,0,1, UTC_TIMESTAMP(3))', [id, code, name, price]);
    await adjustStock(c, id, stock, 'Opening stock (from MG Auto V3)', null, 'import');
    added++;
  });
}
console.log(`${added} part(s) added, ${PARTS.length - added} already there.`);
await db.close();
