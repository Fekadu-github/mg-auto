// Web-security basics every serious product ships with: safe response headers, a request limiter, and one JSON log line per request.
import { randomUUID } from 'node:crypto';

// Headers that stop the common browser attacks (content sniffing, framing/clickjacking, referrer leaks). API answers are never cached,
// because they hold customer and financial data. HSTS is sent only on HTTPS (behind Render/Netlify's proxy `trust proxy` makes q.secure true).
export function securityHeaders() {
  return (q, s, n) => {
    s.removeHeader('X-Powered-By');
    s.setHeader('X-Content-Type-Options', 'nosniff');
    s.setHeader('X-Frame-Options', 'DENY');
    s.setHeader('Referrer-Policy', 'no-referrer');
    s.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (q.secure) s.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    if ((q.originalUrl || q.url || '').startsWith('/api')) s.setHeader('Cache-Control', 'no-store');
    n();
  };
}

// At most `max` requests per `windowMs` from one address (a whole garage shares one address, so the default is generous: it stops
// scripts and floods, not people). `now` can be replaced in tests.
export function rateLimit({ windowMs = 60_000, max = 1200, now = Date.now } = {}) {
  const hits = new Map();
  return (q, s, n) => {
    const t = now(), k = q.ip || 'unknown';
    let h = hits.get(k);
    if (!h || t >= h.reset) {
      h = { n: 0, reset: t + windowMs }; hits.set(k, h);
      if (hits.size > 5000) for (const [kk, v] of hits) if (t >= v.reset) hits.delete(kk);   // forget old addresses
    }
    if (++h.n > max) {
      s.setHeader('Retry-After', String(Math.max(1, Math.ceil((h.reset - t) / 1000))));
      return s.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    n();
  };
}

// One JSON line per request (id, method, path, status, milliseconds, user): easy to search in the Render logs. The id is also sent
// back as X-Request-Id, so a problem reported by a user can be found in the log. Health checks are not logged.
export function requestLog({ log = line => console.log(line), now = Date.now } = {}) {
  return (q, s, n) => {
    const id = randomUUID().slice(0, 8), t0 = now();
    s.setHeader('X-Request-Id', id);
    s.on('finish', () => {
      const path = (q.originalUrl || q.url || '').split('?')[0];
      if (path === '/health') return;
      log(JSON.stringify({ t: new Date(t0).toISOString(), id, m: q.method, p: path, s: s.statusCode, ms: now() - t0, u: q.u?.name || undefined }));
    });
    n();
  };
}
