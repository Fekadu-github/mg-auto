// "Vehicle ready" messages by SMS and/or Telegram. Never throws into the caller: every outcome is written to `notifications`
// so the Service Advisor can see it on the job card.
import { createHmac } from 'node:crypto';
import { e164 } from './lib.js';

export function createNotifier({ cfg, db }) {
  const { sms, telegram: tg } = cfg;
  const secret = tg.webhookSecret || createHmac('sha256', cfg.jwtSecret).update('telegram-webhook').digest('hex');
  let botName = null;

  const tgApi = async (method, body) => {
    const r = await fetch(`https://api.telegram.org/bot${tg.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10000) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw new Error(d.description || 'Telegram error ' + r.status);
    return d.result;
  };

  // AfroMessage-style gateway: POST json with a Bearer key. Check SMS_API_URL and the field names against your provider's docs.
  const sendSms = async (to, message) => {
    const body = { to, message, ...(sms.identifier && { from: sms.identifier }), ...(sms.sender && { sender: sms.sender }) };
    const r = await fetch(sms.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sms.key }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || (d.acknowledge && d.acknowledge !== 'success')) throw new Error(`SMS gateway ${r.status}: ${JSON.stringify(d.response ?? d).slice(0, 160)}`);
  };

  async function init() {
    if (!tg.token) return;
    try {
      botName = (await tgApi('getMe')).username;
      const base = tg.publicUrl.replace(/\/$/, '');
      if (base) await tgApi('setWebhook', { url: base + '/api/telegram/webhook', secret_token: secret, allowed_updates: ['message'] });
      else console.warn('Telegram: set PUBLIC_API_URL so the webhook can be registered');
    } catch (e) { console.error('Telegram setup failed:', e.message); }
  }

  async function notifyReady(job) {
    try {
      const [c] = await db.q('SELECT * FROM customers WHERE id = ?', [job.cid]);
      const [v] = await db.q('SELECT plate FROM vehicles WHERE id = ?', [job.vid]);
      if (!c) return;
      const text = cfg.readyMessage.replace(/\{(\w+)\}/g, (_, k) => ({ name: c.name, plate: v?.plate, jc: job.id, phone: cfg.garage.phone }[k] ?? ''));
      const pref = c.notify || 'both';
      const log = (channel, to, status, error) => db.q('INSERT INTO notifications (job, cid, channel, to_addr, status, error, `at`) VALUES (?,?,?,?,?,?, UTC_TIMESTAMP(3))', [job.id, c.id, channel, (to || '').slice(0, 80), status, error ? String(error).slice(0, 500) : null]);
      if (pref === 'none') return void await log('-', '', 'skipped', 'Customer asked not to be notified');
      if (pref !== 'telegram') {
        const to = e164(c.phone, sms.countryCode);
        if (!sms.key) await log('sms', c.phone, 'skipped', 'SMS gateway is not set up');
        else if (!to) await log('sms', c.phone, 'failed', 'Phone number is not a valid mobile number');
        else try { await sendSms(to, text); await log('sms', to, 'sent'); } catch (e) { await log('sms', to, 'failed', e.message); }
      }
      if (pref !== 'sms') {
        if (!botName) await log('telegram', '', 'skipped', 'Telegram bot is not set up');
        else if (!c.tg_chat) await log('telegram', '', 'skipped', 'Customer has not linked Telegram');
        else try { await tgApi('sendMessage', { chat_id: c.tg_chat, text }); await log('telegram', 'linked chat', 'sent'); } catch (e) { await log('telegram', 'linked chat', 'failed', e.message); }
      }
    } catch (e) { console.error('notifyReady', job.id, e.message); }
  }

  // Telegram webhook body: the customer taps the one-time link, the bot learns their chat id
  async function handleUpdate(update) {
    const m = update?.message, chat = m?.chat?.id;
    if (!chat || m.chat.type !== 'private') return;
    const [cmd, arg] = String(m.text || '').trim().slice(0, 100).split(/\s+/), say = t => tgApi('sendMessage', { chat_id: chat, text: t });
    if (cmd === '/start' && /^[\w-]{8,40}$/.test(arg || '')) {
      const [c] = await db.q('SELECT id, name FROM customers WHERE tg_token = ?', [arg]);
      if (!c) return say('This link is no longer valid. Please ask the service advisor at MG Auto for a new one.');
      await db.q('UPDATE customers SET tg_chat = ?, tg_token = NULL WHERE id = ?', [String(chat), c.id]);
      return say(`Hello ${c.name}! You will get a message here when your vehicle is ready. Send /stop to stop these messages.`);
    }
    if (cmd === '/stop') { await db.q('UPDATE customers SET tg_chat = NULL WHERE tg_chat = ?', [String(chat)]); return say('Done. You will no longer get messages here.'); }
    return say('Welcome to MG Auto. To get a message when your vehicle is ready, open the link the service advisor gave you.');
  }

  return { init, notifyReady, handleUpdate, secret, enabled: !!tg.token, get botName() { return botName; }, smsReady: !!sms.key };
}
