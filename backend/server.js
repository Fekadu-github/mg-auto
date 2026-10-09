// MG Auto API: Express + MySQL. Start with `npm start` (settings: see .env.example).
import bcrypt from 'bcryptjs';
import { loadConfig } from './config.js';
import { createDb, newId } from './db.js';
import { createNotifier } from './notify.js';
import { createApp } from './app.js';

const cfg = loadConfig();
if (cfg.jwtSecret.length < 16) throw new Error('Set JWT_SECRET to a long random string (16+ characters)');

const db = createDb();
await db.migrate();                       // creates the tables on the first start; safe on every start

// first start: create the admin account from ADMIN_USER / ADMIN_PASS
const [{ n }] = await db.q('SELECT COUNT(*) AS n FROM app_users');
if (!n && cfg.adminUser && cfg.adminPass) {
  if (cfg.adminPass.length < 8) throw new Error('ADMIN_PASS needs at least 8 characters');
  await db.q('INSERT INTO app_users (id, username, name, role, pass_hash, created_at) VALUES (?,?,?,?,?, UTC_TIMESTAMP(3))',
    [newId(), cfg.adminUser.toLowerCase(), 'Administrator', 'ADMIN', await bcrypt.hash(cfg.adminPass, 10)]);
  console.log('Admin account created');
} else if (!n) console.warn('No users yet: set ADMIN_USER and ADMIN_PASS and restart to create the administrator');

const notifier = createNotifier({ cfg, db });
const server = createApp({ cfg, db, notifier }).listen(cfg.port, () => console.log('MG Auto API on ' + cfg.port));
notifier.init();                          // Telegram webhook registration; never blocks or crashes the start

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => db.close().finally(() => process.exit(0))));
