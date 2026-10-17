// npm run migrate: create the tables (safe to run again)
import { createDb } from '../db.js';
const db = createDb();
await db.migrate();
console.log('Database is ready.');
await db.close();
