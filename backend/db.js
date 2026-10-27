import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { splitSql, ROLE_ENUM, lacksManagerRole } from './sql.js';
import { DEFAULT_LABOUR, DEFAULT_SERVICES } from './services.js';
import { missingPriceBook } from './labour.seed.js';
import { DEFAULT_INSURERS } from './insurers.seed.js';

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

// Columns added after the first release: [table, column, definition]. The same columns are in schema.sql for new databases.
export const NEW_COLUMNS = [
  ['vehicles', 'mileage', 'INT NULL'], ['vehicles', 'next_km', 'INT NULL'], ['vehicles', 'next_type', 'VARCHAR(10) NULL'],
  ['customers', 'insurer_id', 'CHAR(36) NULL'], ['customers', 'policy_no', 'VARCHAR(60) NULL'], ['estimates', 'pro', 'VARCHAR(40) NULL'], ['estimates', 'guest_name', "VARCHAR(120) NOT NULL DEFAULT ''"], ['estimates', 'guest_phone', "VARCHAR(30) NOT NULL DEFAULT ''"], ['estimates', 'guest_plate', "VARCHAR(30) NOT NULL DEFAULT ''"], ['estimates', 'guest_brand', "VARCHAR(40) NOT NULL DEFAULT ''"], ['estimates', 'guest_model', "VARCHAR(60) NOT NULL DEFAULT ''"], ['estimates', 'guest_vin', "VARCHAR(40) NOT NULL DEFAULT ''"], ['estimates', 'guest_eng', "VARCHAR(40) NOT NULL DEFAULT ''"],
  ['jobs', 'mileage', 'INT NULL'], ['jobs', 'services', 'JSON NULL'], ['jobs', 'est', 'VARCHAR(40) NULL'], ['jobs', 'requests', 'JSON NULL'], ['jobs', 'payer', 'VARCHAR(160) NULL'], ['jobs', 'policy_no', 'VARCHAR(60) NULL'],
  ['customers', 'tin', "VARCHAR(40) NOT NULL DEFAULT ''"], ['inventory', 'category', "VARCHAR(60) NOT NULL DEFAULT ''"], ['inventory', 'cost', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
  ['jobs', 'mileage_out', 'INT NULL'], ['jobs', 'claim_no', 'VARCHAR(60) NULL'], ['jobs', 'due_date', 'DATE NULL'], ['jobs', 'priority', 'VARCHAR(20) NULL'], ['jobs', 'price_reqs', 'JSON NULL'],
  ['proformas', 'claim_no', "VARCHAR(60) NOT NULL DEFAULT ''"], ['proformas', 'priority', "VARCHAR(20) NOT NULL DEFAULT ''"], ['proformas', 'due_date', 'DATE NULL'], ['proformas', 'terms', "VARCHAR(1000) NOT NULL DEFAULT ''"],
  ['proformas', 'guest_name', "VARCHAR(120) NOT NULL DEFAULT ''"], ['proformas', 'guest_phone', "VARCHAR(30) NOT NULL DEFAULT ''"], ['proformas', 'guest_plate', "VARCHAR(30) NOT NULL DEFAULT ''"],
  ['proformas', 'guest_brand', "VARCHAR(40) NOT NULL DEFAULT ''"], ['proformas', 'guest_model', "VARCHAR(60) NOT NULL DEFAULT ''"],
  ['proformas', 'guest_vin', "VARCHAR(40) NOT NULL DEFAULT ''"], ['proformas', 'guest_eng', "VARCHAR(40) NOT NULL DEFAULT ''"],
  ['labour_tasks', 'task', "VARCHAR(200) NOT NULL DEFAULT ''"],
  ['labour_tasks', 'code', "VARCHAR(40) NOT NULL DEFAULT ''"], ['labour_tasks', 'model_grp', "VARCHAR(60) NOT NULL DEFAULT ''"],
  ['customers', 'ref_cid', 'VARCHAR(40) NULL'], ['customers', 'ref_name', "VARCHAR(200) NOT NULL DEFAULT ''"], ['customers', 'ref_phone', "VARCHAR(30) NOT NULL DEFAULT ''"],   // who referred this customer to the garage
  ['insurers', 'address', "VARCHAR(200) NOT NULL DEFAULT ''"],
  ['app_users', 'totp_secret', 'VARCHAR(64) NULL'], ['app_users', 'totp_on', 'TINYINT(1) NOT NULL DEFAULT 0'], ['app_users', 'totp_last', 'BIGINT NULL'], ['app_users', 'pass_enc', 'VARCHAR(400) NULL']
];


export function createDb(env = process.env) {
  const pool = mysql.createPool(poolOptions(env));
  // Keep every session in UTC. (Inserts below also write UTC_TIMESTAMP(3) themselves, so they are right even if this hook is skipped.)
  pool.on('connection', c => { c.query("SET time_zone = '+00:00'", () => {}); });

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
  // Then add the columns that older databases lack (MySQL has no ADD COLUMN IF NOT EXISTS) and create the starting service packages once.
  async function migrate(file = new URL('./sql/schema.sql', import.meta.url)) {
    for (const stmt of splitSql(await readFile(file, 'utf8'))) await pool.query(stmt);
    for (const [table, col, ddl] of NEW_COLUMNS) {
      const [rows] = await pool.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, col]);
      if (!rows.length) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${ddl}`);
    }
    // Older databases: the labour list was unique on (name, section); a task now has several lines, so the key includes the task
    const [oldKey] = await pool.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'labour_tasks' AND INDEX_NAME = 'labour_tasks_name' GROUP BY INDEX_NAME HAVING COUNT(*) = 2");
    if (oldKey.length) await pool.query('ALTER TABLE labour_tasks DROP INDEX labour_tasks_name, ADD UNIQUE KEY labour_tasks_name (task, name, section)');
    // The Excel price book has the same description under several codes and model groups, so the key also holds the code and the model group
    const [midKey] = await pool.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'labour_tasks' AND INDEX_NAME = 'labour_tasks_name' GROUP BY INDEX_NAME HAVING COUNT(*) = 3");
    if (midKey.length) await pool.query('ALTER TABLE labour_tasks DROP INDEX labour_tasks_name, ADD UNIQUE KEY labour_tasks_name (code, model_grp, task, name, section)');
    // Older databases made the proforma's customer and vehicle required: a walk-in proforma has neither yet
    // (an estimate can also be drafted before the customer is registered)
    for (const table of ['proformas', 'estimates']) for (const [col, ddl] of [['cid', 'VARCHAR(40) NULL'], ['vid', 'CHAR(36) NULL']]) {
      const [[c]] = await pool.query("SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, col]);
      if (c && c.n === 'NO') await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${col}\` ${ddl}`);
    }
    // Proformas made before the estimate's customer details were copied over: fill the blank walk-in details from the estimate with the same EST number
    await pool.query("UPDATE proformas p JOIN estimates e ON e.id = p.id SET p.guest_name = e.guest_name, p.guest_phone = e.guest_phone, p.guest_plate = e.guest_plate, p.guest_brand = e.guest_brand, p.guest_model = e.guest_model, p.guest_vin = e.guest_vin, p.guest_eng = e.guest_eng WHERE p.status <> 'Converted' AND p.cid IS NULL AND p.guest_name = '' AND p.guest_phone = '' AND p.guest_plate = '' AND e.cid IS NULL AND (e.guest_name <> '' OR e.guest_plate <> '')");
    const [roleCol] = (await pool.query("SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'role'"))[0];
    if (roleCol && lacksManagerRole(roleCol.t)) await pool.query(`ALTER TABLE app_users MODIFY COLUMN role ${ROLE_ENUM} NOT NULL`);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM service_types');
    const [[{ m }]] = await pool.query('SELECT COUNT(*) AS m FROM labour_tasks');
    if (!m) for (const t of DEFAULT_LABOUR) await pool.query('INSERT IGNORE INTO labour_tasks (id, name, section, hours, price) VALUES (UUID(),?,?,?,?)', [t.name, t.section, t.hours, t.price]);
    // The labour price book (labour code, description, model group, hours): lines not yet in the list are added when the server starts, 200 at a time.
    // A line already there (same code and model group) is left exactly as it is. Never stops the start.
    try {
      const [have] = await pool.query('SELECT code, model_grp FROM labour_tasks');
      const add = missingPriceBook(have);
      for (let i = 0; i < add.length; i += 200) {
        const part = add.slice(i, i + 200);
        await pool.query(`INSERT IGNORE INTO labour_tasks (id, code, model_grp, task, name, section, hours, price, active) VALUES ${part.map(() => "(UUID(),?,?,'',?,?,?,0,1)").join(',')}`, part.flatMap(l => [l.code, l.model_grp, l.name, l.section, l.hours]));
      }
      if (add.length) console.log(`Labour price book: ${add.length} lines added`);
    } catch (e) { console.error('Labour price book skipped:', e.message); }
    for (const i of DEFAULT_INSURERS) await pool.query('INSERT IGNORE INTO insurers (id, name, phone, active) VALUES (UUID(),?,?,1)', [i.name, i.phone]);   // the contact directory's companies; INSERT IGNORE skips a name already there
    for (const t of DEFAULT_SERVICES) if (!n || t.code === 'D') await pool.query('INSERT IGNORE INTO service_types (code, name, interval_km, labours, parts, active) VALUES (?,?,?,?,?,1)', [t.code, t.name, t.interval_km, JSON.stringify(t.labours), JSON.stringify(t.parts)]);
    // Repair: a proforma left "Converted" with no job card (the card was deleted) goes back to Finalized so it can be used again,
    // and an estimate that says it is on a job card that no longer exists is free again. Never stops the start.
    try {
      await pool.query("UPDATE proformas SET status = 'Issued', job = NULL, est = NULL WHERE status = 'Converted' AND (job IS NULL OR NOT EXISTS (SELECT 1 FROM jobs x WHERE x.id = proformas.job))");
      await pool.query('UPDATE estimates SET used_in = NULL WHERE used_in IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jobs x WHERE x.id = estimates.used_in)');
    } catch (e) { console.error('Repair of proformas/estimates skipped:', e.message); }
    try { await pool.query('DELETE FROM audit_log WHERE at < UTC_TIMESTAMP() - INTERVAL 400 DAY'); } catch (e) { console.error('Audit clean-up skipped:', e.message); }   // the trail is kept for about 13 months
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
