# MADEG Garage · MG Auto

Job cards, workshop clocks, parts stock, invoices and delivery vouchers for the garage.

```
React (Vite) app  →  Node.js API (Express)  →  MySQL 8 / MariaDB 10.5+
frontend/             backend/                 backend/sql/schema.sql
```

The API can serve the built React app itself, so one service is enough (Docker, Render, a VPS).

## Run it on your computer (development)
Needs Node 20+ and a MySQL or MariaDB server.

```
# 1. database
mysql -uroot -p -e "CREATE DATABASE mg_auto CHARACTER SET utf8mb4; CREATE USER 'mgauto'@'%' IDENTIFIED BY 'change-me'; GRANT ALL ON mg_auto.* TO 'mgauto'@'%';"

# 2. API  (http://localhost:3000)
cd backend
cp .env.example .env            # set DATABASE_URL, JWT_SECRET, ADMIN_USER, ADMIN_PASS
npm install
npm run dev                     # creates the tables and the admin account on first start
npm run seed                    # optional: the 4 starter parts

# 3. React app  (http://localhost:5173, /api is proxied to port 3000)
cd ../frontend
npm install
npm run dev
```
Sign in with `ADMIN_USER` / `ADMIN_PASS`, open **Staff** and create the Service Advisor, Workshop Supervisor and Technician accounts.

## Deploy
### A. Docker Compose (MySQL + app on one machine)
Create a `.env` next to `docker-compose.yml`:
```
DB_PASSWORD=...        DB_ROOT_PASSWORD=...
JWT_SECRET=...         # long random string
ADMIN_PASS=...         # 8+ characters
```
`docker compose up -d --build`, then open `http://<machine>:3000`. Data lives in the `dbdata` volume; back it up with `docker compose exec db mysqldump -uroot -p mg_auto > backup.sql`. Put it behind HTTPS (Caddy, nginx or your host's proxy) before real use.

### B. Render + hosted MySQL
Render has no managed MySQL, so rent one (Aiven, Railway, a VPS) and create an empty database.
1. Push the repo to GitHub. Render → New → Blueprint → pick the repo (it reads `render.yaml` and builds the `Dockerfile`).
2. Set `DATABASE_URL` (`mysql://user:password@host:3306/mg_auto`) and `ADMIN_PASS`. Keep `DB_SSL=true` for hosted MySQL, and paste the provider's CA into `DB_SSL_CA` if it asks for one.
3. Open `https://<service>.onrender.com/health`: `{"ok":true}` means the API reaches the database.

### C. React app on Netlify, API elsewhere (optional)
`netlify.toml` builds `frontend/`. Set `VITE_API_URL` in Netlify to the API address and `CORS_ORIGIN` on the API to the Netlify address.

Tables are created automatically when the API starts (`npm run migrate` does it by hand). The schema is safe to run again.

## Settings (environment variables)
All of them, with comments, are in `backend/.env.example`. The important ones:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` or `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | MySQL connection. `DB_SSL=true` for TLS |
| `JWT_SECRET` | signs sign-in tokens (16+ characters) |
| `ADMIN_USER`, `ADMIN_PASS` | first administrator, created when there are no users |
| `LABOUR_RATE` | ETB per hour; typing hours on a labour line fills the price (default 350) |
| `VAT_RATE` | fraction, default `0.15`. Amounts are frozen on each invoice when it is issued |
| `GARAGE_NAME` `GARAGE_ADDRESS` `GARAGE_PHONE` `GARAGE_TIN` `GARAGE_MOTTO` | printed on invoices and the voucher |
| `FRONTEND_DIR` | folder of the built React app for the API to serve (set in the Docker image) |

## Workflow
Receive customer → customer and vehicle → job card (`TC-YYYYMMDD-0001`) with labour per section → **Dispatch to workshop** (SA) → **Receive job card** (WS) → technicians clock in/out per labour (Completed, Lunch, End of work day, Supervisor command) → **Dispatch back** (WS) → **Receive** (SA) → **Close** (SA; the customer is told the vehicle is ready) → **proforma** (A4, can be printed again and again) or one **cash / credit invoice** (`INV-YYYYMMDD-0001`, 80 mm receipt) → **delivery voucher** (A4, signature lines) and hand-over.

Customers are `CUS-YYYYMMDD-0001`. Vehicles have Brand and Model. The job card dialog is in `frontend/src/dialogs/JobCardDialog.jsx`; the printed documents are `frontend/src/print/InvoiceDoc.jsx` and `VoucherDoc.jsx` (styles in `styles/print.css`). The browser's print dialog is used, so choose the receipt printer for POS documents.

## Roles
| Role | Can do |
|---|---|
| Service Advisor | customers, vehicles, job cards, labour, parts, dispatch, receive, close, invoices, delivery, stock, revenue and hours reports |
| Workshop Supervisor | receive and dispatch back job cards, clock in/out, supervisor stop, view stock, hours report |
| Technician | clock in/out on labour (own clocks only, one running clock at a time), own hours |
| Administrator | everything, plus staff accounts |

Every rule (role, status order, completed labour cannot be clocked in again, all labour completed before dispatch back) is enforced in `backend/rules.js` and `backend/app.js`, not only in the screens.

## Parts stock
**Parts stock** tab: code, name, unit price (before VAT), stock, reorder level. The Service Advisor receives deliveries, does stock counts (a reason is required) and edits prices; every change is in the part's **History**. On a job card, typing a code or name in *Part* picks from the list: the quantity leaves stock and the catalogue price is used. Removing the line puts it back. Anything not in the list is accepted as free text and not tracked. Stock cannot go below zero.

## Reports
**Reports** tab (Addis Ababa days, CSV download on each): **Revenue** (cash and credit invoices by the day issued; credit is shown separately; proformas are not counted) and **Technician hours** (clock-in to clock-out by technician, day and section; a technician sees only their own).

## "Vehicle ready" messages (SMS and/or Telegram)
When the Service Advisor closes a job card, the customer is told the vehicle is ready. Each customer is set to SMS + Telegram, SMS only, Telegram only, or do not notify. Every attempt (sent, failed, skipped and why) is listed on the job card with a **Send again** button (one per minute). A channel that is not set up never blocks closing.

- **SMS**: set `SMS_API_KEY` (and `SMS_IDENTIFIER` / `SMS_SENDER`). The code is written for AfroMessage; check `SMS_API_URL` and the field names in `sendSms()` in `backend/notify.js` against your provider, then close a test job card for a customer with your own number. `0980766566` becomes `+251980766566`.
- **Telegram**: create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN` and `PUBLIC_API_URL` (https address of the API). The webhook registers itself on start. In **Customers** press **Telegram link**, send it to the customer, and they tap **Start**. The link works once; `/stop` opts out.
- Wording: `READY_MESSAGE` with `{name} {plate} {jc} {phone}`.

## Checks
```
cd backend  && npm test                      # business rules, VAT, reports, phone numbers (no database needed)
cd backend  && TEST_DATABASE_URL=mysql://user:pw@127.0.0.1:3306/mg_auto_test npm test
                                             # adds the end-to-end API test; use an empty throw-away database
cd frontend && npm test                      # totals, invoice and voucher documents
cd frontend && npm run build                 # production build into frontend/dist
```

## Notes
- Times are stored in UTC and shown as Addis Ababa time.
- The installed app (PWA) opens offline, but saving needs a connection.
- Two people saving the same job card at once take turns (the row is locked), so no one overwrites the other.
- Reports read the job cards table directly; if it grows to many thousands of rows, move them into SQL views.
- Render's free plan sleeps after inactivity; the first request can take about 50 seconds.
- Labour is priced per line when the job card is created; it is not recalculated from clocked hours.
