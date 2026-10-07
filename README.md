# MG Auto Garage — Netlify + Render + Supabase

```
Netlify (frontend PWA)  →  Render (Express API)  →  Supabase (Postgres)
```
Repo layout: `frontend/` (static PWA), `backend/` (Node API), `supabase/schema.sql`, `render.yaml`, `netlify.toml`.

## 1. Supabase (database)
1. Create a project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Settings → API: copy the **Project URL** and the **service_role** key. The service_role key is secret: it goes only into Render, never into the frontend.

## 2. GitHub
```
cd mg-auto
git init && git add . && git commit -m "MG Auto garage app"
git branch -M main
git remote add origin https://github.com/<you>/mg-auto.git
git push -u origin main
```

## 3. Render (backend)
1. Render → New → Blueprint → pick the repo (it reads `render.yaml`). Or New → Web Service with root directory `backend`, build `npm install`, start `npm start`.
2. Set environment variables (full list with comments in `backend/.env.example`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` from step 1
   - `JWT_SECRET` (the blueprint generates it)
   - `ADMIN_USER`, `ADMIN_PASS` (first admin, created on first start; use 8+ characters)
   - `CORS_ORIGIN` = your Netlify URL, e.g. `https://mg-auto.netlify.app` (set after step 4)
   - Optional: `VAT_RATE`, `GARAGE_PHONE`, and the SMS / Telegram settings in section 6
3. Open `https://<service>.onrender.com/health`. It should return `{"ok":true}`.

## 4. Netlify (frontend)
1. Edit `frontend/config.js` and set `API_URL` to your Render URL. Commit and push.
2. Netlify → Add new site → Import from GitHub. Netlify reads `netlify.toml` (publish folder `frontend`, no build step).
3. Go back to Render and set `CORS_ORIGIN` to the Netlify URL.

## 5. First use
Sign in as the admin → **Staff** tab → create Service Advisor, Workshop Supervisor and Technician accounts. Open the Netlify site on a phone and choose "Add to Home Screen" / "Install".

## 6. "Vehicle ready" messages (SMS and/or Telegram)
When the Service Advisor **closes** a job card (labour and parts checked), the customer is told the vehicle is ready. Each customer has a setting: SMS + Telegram, SMS only, Telegram only, or do not notify. Every attempt (sent, failed, or skipped and why) is listed on the job card, with a **Send again** button (one per minute). A channel that is not set up never blocks closing the job card.

**SMS**: create an account with an SMS gateway that can send to Ethiopian numbers (the code is written for AfroMessage's API). Set `SMS_API_KEY`, and `SMS_IDENTIFIER` / `SMS_SENDER` if your account has them. Check `SMS_API_URL` and the field names in `sendSms()` against your provider's documentation, then close a test job card for a customer with your own number. Phone numbers such as `0980766566` are converted to `+251980766566`.

**Telegram**: a bot cannot message someone who has not started it first.
1. In Telegram, talk to **@BotFather**, create a bot, and put its token in `TELEGRAM_BOT_TOKEN` on Render. On start the API registers its own webhook (Render provides the public URL; otherwise set `PUBLIC_API_URL`).
2. In **Customers**, press **Telegram link** on the customer. Send the link to them (or open it on their phone) and they tap **Start**. The customer list then shows "linked". The link works once. The customer can send `/stop` to opt out.

Change the wording with `READY_MESSAGE` (placeholders `{name} {plate} {jc} {phone}`). Amharic text works, but an SMS in Ethiopic script carries fewer characters per message.

## 7. Parts stock
**Parts stock** tab: code, name, unit price (before VAT), stock, reorder level. The Service Advisor receives deliveries, does stock counts (a reason is required), and edits prices. Every change is in the part's **History**. On a job card, typing a code or name in *Part* picks from the list: the quantity leaves stock and the catalogue price is used. Removing the line puts it back. Anything not in the list is still accepted as free text and is not tracked. Stock cannot go below zero.

## 8. Reports
**Reports** tab (Addis Ababa days, CSV download on each):
- **Revenue** (Service Advisor, Administrator): cash and credit invoices by the day issued, with labour, parts, VAT and total. Credit is shown separately because it is still to be collected. Proformas are quotes and are not counted.
- **Technician hours** (Service Advisor, Supervisor, Administrator; a technician sees only their own): time between clock-in and clock-out, by technician, by day and by section. A clock still running counts up to now and is flagged.

## Workflow in the app
Receive customer → maintain customer and vehicle → create job card (JC-0001…) and add labour per section → **Dispatch to workshop** (SA) → **Receive job card** (WS) → technicians clock in/out per labour (reasons: Completed, Lunch, End of work day, Supervisor command) → **Dispatch back to SA** (WS) → **Receive job card** (SA) → **Close** (SA) → proforma (A4 print, can be repeated), or one cash/credit invoice (POS print) → delivery voucher and hand-over.

If you ran an older `schema.sql` already: `alter table customers rename column home to house;` and then run the whole updated `supabase/schema.sql` again. It is safe to repeat and adds everything new (job card versioning, parts, notifications). **Run it before deploying the new backend.**

## Roles
| Role | Can do |
|---|---|
| Service Advisor | customers, vehicles, job cards, labour, parts, dispatch, receive, close, invoices, delivery, stock, revenue and hours reports |
| Workshop Supervisor | receive and dispatch back job cards, clock in/out, supervisor stop, view stock, hours report |
| Technician | clock in/out on labour (own clocks only, one running clock at a time), own hours |
| Administrator | everything, plus staff accounts |

Every rule (role, status order, "completed labour cannot be clocked in again", all labour completed before dispatch back) is enforced in `backend/server.js`, not only in the UI.

## Notes
- Render's free plan sleeps after inactivity, so the first request can take about 50 seconds. A paid instance avoids this.
- The installed app opens offline, but saving data needs a connection.
- VAT is the `VAT_RATE` setting on Render (default `0.15`). The amounts are frozen on each invoice when it is issued, so changing the rate never alters old invoices or reports.
- Two people saving the same job card at the same moment can no longer overwrite each other: the second save is retried on fresh data.
- Reports read the job cards table directly; if it grows to many thousands of rows, move them into SQL views.
- Tests for the report, VAT and phone logic: `cd backend && npm test`.
- Local run: `cd backend && cp .env.example .env`, fill it in, `npm install && node --env-file=.env server.js`.
