// All settings come from environment variables (see .env.example).
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);

export function loadConfig(env = process.env) {
  const vat = num(env.VAT_RATE, 0.15), rate = num(env.LABOUR_RATE, 350);
  return {
    port: num(env.PORT, 3000),
    jwtSecret: env.JWT_SECRET || '',
    corsOrigin: env.CORS_ORIGIN || '*',
    rateLimitPerMin: num(env.RATE_LIMIT_PER_MIN, 1200) > 0 ? num(env.RATE_LIMIT_PER_MIN, 1200) : 1200,   // requests per minute from one address (a whole garage shares one)
    requestLog: env.REQUEST_LOG !== 'false',     // one JSON line per request in the logs
    frontendDir: env.FRONTEND_DIR || '',          // optional: serve the built React app from this API (single-host deploys)
    adminUser: env.ADMIN_USER || '', adminPass: env.ADMIN_PASS || '',
    vat: vat >= 0 && vat < 1 ? vat : 0.15,       // fraction: 0.15 = 15%
    priceLimitPct: num(env.PRICE_LIMIT_PCT, 10) >= 0 ? num(env.PRICE_LIMIT_PCT, 10) : 10,   // a price change beyond this % of the list price needs the manager (0 = no limit)
    workEnd: /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(env.WORK_END || '').trim()) ? String(env.WORK_END).trim() : '',   // e.g. 17:30: running clocks are closed then (empty = only by hand)
    labourRate: rate >= 0 ? rate : 350,           // ETB per labour hour
    garage: {
      name: env.GARAGE_NAME || 'MADEG — MG Auto',
      address: env.GARAGE_ADDRESS || 'Gurdshola, around Top Ten Hotel, Addis Ababa',
      phone: env.GARAGE_PHONE || '0980766566',
      tin: env.GARAGE_TIN || '',                  // printed on invoices when set
      email: env.GARAGE_EMAIL || '',              // printed in the letterhead of estimates when set
      bank: env.GARAGE_BANK || '',                // bank accounts, printed in the terms of estimates, e.g. "CBE 1000123456789 · Awash 0130..."
      motto: env.GARAGE_MOTTO || 'Your car, our care'
    },
    readyMessage: env.READY_MESSAGE || 'MG Auto: Dear {name}, your vehicle {plate} is ready (job card {jc}). Please come to collect it. Questions? Call {phone}.',
    sms: {
      url: env.SMS_API_URL || 'https://api.afromessage.com/api/send', key: env.SMS_API_KEY || '',
      identifier: env.SMS_IDENTIFIER || '', sender: env.SMS_SENDER || '', countryCode: env.SMS_COUNTRY_CODE || '251'
    },
    telegram: {
      token: env.TELEGRAM_BOT_TOKEN || '', webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',
      publicUrl: env.PUBLIC_API_URL || env.RENDER_EXTERNAL_URL || ''
    }
  };
}
