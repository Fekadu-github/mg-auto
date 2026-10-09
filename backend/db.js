import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { splitSql } from './sql.js';

// Connection settings: DATABASE_URL (mysql://user:pass@host:3306/name) or DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME.
// DB_SSL=true turns on TLS (needed by most hosted MySQL services); DB_SSL_CA may hold the provider's CA certificate (PEM text).
export function poolOptions(env = process.env) {
  const base = {
    connectionLimit: Number(env.DB_POOL || 10), charset: 'utf8mb4',
    timezone: 'Z',                       // DATETIME values are UTC
    decimalNumbers: true,                // DECIMAL columns come back as numbers, not strings
    dateStrings: ['DATE'],               // DATE columns (date of birth) come back as 'YYYY-MM-DD'
    enableKeepAlive: true, waitForConnections: true
  };
  if (env.DB_SSL === 'true') base.ssl = env.DB_SSL_CA ? { ca: env.DB_SSL_CA, minVersion: 'TLSv1.2' } : { minVersion: 'TLSv1.2' };
  if (env.DATABASE_URL) return { uri: env.DATABASE_URL, ...base };
  return { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 3306), user: env.DB_USER || 'root', password: env.DB_PASSWORD || '', database: env.DB_NAME || 'mg_auto', ...base };
}

export function createDb(env = process.env) {
  const pool = mysql.createPool(poolOptions(env));
  // Keep every session in UTC. (Inserts below also write UTC_TIMESTAMP(3) themselves, so they are right even if this hook is skipped.)
  pool.on('connection', c => { const r = c.query("SET time_zone = '+00:00'"); r?.catch?.(() => {}); });

  // Run one statement. Returns the rows (SELECT) or the result header (INSERT / UPDATE / DELETE).
  const run = (conn) => async (sql, params = []) => (await conn.query(sql, params))[0];
  const q = run(pool);

  // Run fn(c) inside a transaction; c.q(sql, params) works like db.q. A deadlock is retried a few times.
  async function tx(fn) {
    for (let attempt = 1; ; attempt++) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = await fn({ q: run(conn), conn });
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback().catch(() => {});
        if (e.code === 'ER_LOCK_DEADLOCK' && attempt < 3) continue;
        throw e;
      } finally { conn.release(); }
    }
  }

  // Run the schema file. Every statement is IF NOT EXISTS, so this is safe on every start.
  async function migrate(file = new URL('./sql/schema.sql', import.meta.url)) {
    for (const stmt of splitSql(await readFile(file, 'utf8'))) await pool.query(stmt);
  }

  return { pool, q, tx, migrate, close: () => pool.end() };
}

// Next number of a counter (customers, job cards, invoices). Atomic: the counter row is locked until the caller's transaction ends.
// LAST_INSERT_ID(expr) hands the new value back through insertId; a brand-new counter starts at 1.
export async function nextNo(c, k) {
  const r = await c.q('INSERT INTO counters (k, n) VALUES (?, 1) ON DUPLICATE KEY UPDATE n = LAST_INSERT_ID(n + 1)', [k]);
  return Number(r.insertId) || 1;
}

// V3 style numbers: PREFIX-YYYYMMDD-0001 (Addis Ababa date; the counter keeps counting, it does not restart each day)
export async function numberFor(c, k, prefix, now = Date.now()) {
  const day = new Date(now + 3 * 36e5).toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}${day}-${String(await nextNo(c, k)).padStart(4, '0')}`;
}

export const newId = () => randomUUID();

// The only way stock changes: atomic, refuses to go below zero, always leaves a history row.
// Returns the new balance, or null when the part is missing or there is not enough stock.
export async function adjustStock(c, id, delta, reason, job, by, note) {
  const r = await c.q('UPDATE inventory SET stock = stock + ? WHERE id = ? AND stock + ? >= 0', [delta, id, delta]);
  if (!r.affectedRows) return null;
  const [{ stock }] = await c.q('SELECT stock FROM inventory WHERE id = ?', [id]);
  await c.q('INSERT INTO stock_moves (part_id, delta, balance, reason, job, by_name, note, `at`) VALUES (?,?,?,?,?,?,?, UTC_TIMESTAMP(3))', [id, delta, stock, reason, job || null, by, note || null]);
  return Number(stock);
}

// JSON columns come back parsed on MySQL and as text on MariaDB
export const J = (v, d) => (v == null ? d : typeof v === 'string' ? JSON.parse(v) : v);
