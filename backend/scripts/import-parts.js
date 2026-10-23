// npm run import-parts: add the Suzuki (S...) and Toyota (T...) parts from the stock list (PARTS.pdf) to the parts list.
// Part number = item code, description = item description. Price, cost, stock and reorder level start at 0.
// Safe to repeat: a part whose code is already in the system is skipped, nothing is overwritten.
import { readFileSync } from 'node:fs';
import { createDb, newId } from '../db.js';

const PARTS = JSON.parse(readFileSync(new URL('./parts-suzuki-toyota.json', import.meta.url), 'utf8'));
const db = createDb();
await db.migrate();
let added = 0;
await db.tx(async c => {
  const have = new Set((await c.q('SELECT code FROM inventory')).map(r => String(r.code).toUpperCase()));
  for (const [code, name] of PARTS) {
    if (have.has(code.toUpperCase())) continue;
    await c.q('INSERT INTO inventory (id, code, name, cost, price, stock, reorder, active, created_at) VALUES (?,?,?,0,0,0,0,1, UTC_TIMESTAMP(3))', [newId(), code, name]);
    have.add(code.toUpperCase());
    added++;
  }
});
console.log(`${added} part(s) added, ${PARTS.length - added} already there.`);
await db.close();
