// npm run seed: add the 4 starter parts (part numbers start with T: Toyota) from the MG Auto V3 prototype. Safe to repeat: a part whose code exists is skipped.
import { createDb, newId, adjustStock } from '../db.js';

export const PARTS = [
  ['TOIL-001', 'Engine Oil 15W-40', 450, 100], ['TFLT-001', 'Oil Filter', 350, 30],
  ['TBRK-001', 'Brake Pad Set', 2500, 20], ['TSUS-001', 'Shock Absorber', 4200, 16]
];
const db = createDb();
await db.migrate();
let added = 0;
for (const [code, name, price, stock] of PARTS) {
  await db.tx(async c => {
    if ((await c.q('SELECT id FROM inventory WHERE code = ?', [code])).length) return;
    const id = newId();
    await c.q('INSERT INTO inventory (id, code, name, cost, price, stock, reorder, active, created_at) VALUES (?,?,?,?,?,0,5,1, UTC_TIMESTAMP(3))', [id, code, name, Math.round(price / 1.3 * 100) / 100, price]);   // cost = price / 1.3 (the price is cost x 1.3)
    await adjustStock(c, id, stock, 'Opening stock (from MG Auto V3)', null, 'import');
    added++;
  });
}
console.log(`${added} part(s) added, ${PARTS.length - added} already there.`);
await db.close();
