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
Sign in with `ADMIN_USER` / `ADMIN_PASS`, open **Staff** and create the Manager, Service Advisor, Workshop Supervisor and Technician accounts (only the Manager can set costs and prices).

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
| `PRICE_LIMIT_PCT` | a price on a job card may differ from its list price by this percentage on the Service Advisor's say-so; beyond it the manager must approve (default `10`, `0` = no limit) |
| `WORK_END` | end of the working day, `HH:MM` Addis Ababa time (for example `17:30`). Running clocks are closed by themselves then. Empty = by hand only (the *End of working day* button on the Workshop screen) |
| `GARAGE_NAME` `GARAGE_ADDRESS` `GARAGE_PHONE` `GARAGE_TIN` `GARAGE_MOTTO` | printed on invoices and the voucher |
| `GARAGE_EMAIL` `GARAGE_BANK` | optional: the e-mail shown in the letterhead, and the bank accounts printed in the terms of estimates / proformas (free text, e.g. `CBE 1000... · Awash 0130...`) |
| `FRONTEND_DIR` | folder of the built React app for the API to serve (set in the Docker image) |

## Workflow
Receive customer → customer and vehicle → job card (`TC-YYYYMMDD-0001`) with labour per section → **Dispatch to workshop** (SA) → **Receive job card** (WS) → technicians clock in/out per labour (Completed, Lunch, End of work day, Supervisor command) → **Dispatch back** (WS) → **Receive** (SA) → **Close** (SA; the customer is told the vehicle is ready) → **proforma** (A4, can be printed again and again) or one **cash / credit invoice** (`INV-YYYYMMDD-0001`, 80 mm receipt) → **delivery voucher** (A4, signature lines) and hand-over.

Customers are `CUS-YYYYMMDD-0001`. Vehicles have Brand and Model. The job card dialog is in `frontend/src/dialogs/JobCardDialog.jsx`; the printed documents are `frontend/src/print/InvoiceDoc.jsx` and `VoucherDoc.jsx` (styles in `styles/print.css`). The browser's print dialog is used, so choose the receipt printer for POS documents.

## Garage workflow additions
- **Selling price editable before the invoice.** On a job card the Service Advisor can press *Edit* next to any labour or part price until the invoice is issued. A part keeps its catalogue price as *list* for reference, and every change is written in the card's history. After a cash or credit invoice, prices are locked.
- **Mileage first.** Mileage is required when a vehicle is registered and again on every job card (it cannot be lower than the last recorded reading). When a job card with a service is **closed**, the vehicle's mileage moves forward and the next service is suggested (shown on the card and in *Customers*).
- **Type A / B / C services (Services screen).** Each type has a km interval and a labour and parts list. *Add Type A* on a job card adds its labour (priced from hours x `LABOUR_RATE`) and parts (issued from stock when the code is in the stock list). The suggested type is highlighted. The starting packages (5,000 / 10,000 / 20,000 km) are examples: edit them on the Services screen. The next milestone belongs to the type with the largest interval that divides it (A at 5,000 -> B at 10,000 -> A at 15,000 -> C at 20,000).
- **Estimates and proformas (Body & Paints), draft and finalized.** An estimate and the proforma made from it (*Proformas* > *New proforma* > *From a draft estimate*, by the EST number) are one document with one number. *Finalize estimate* (also for an estimate with no customer yet) finalizes its draft proforma too, with the estimate's lines; *Finalize proforma* finalizes the estimate (the estimate is made at that moment when only the proforma existed). *Back to draft* on the estimate returns the proforma to draft. After finalizing, a change to the proforma's lines is copied to the estimate until it is on a job card. When a **job card is created**, the *Finalized estimate* box lists the finalized estimates as you type (one letter, a number, a name or a plate is enough): picking one lists its labour and parts and adds them to the new card; the same box is in the job card's Labour section. *New proforma* is made only from an estimate: EST numbers are given by estimations, never by a proforma. The estimation-number box suggests as you type (one letter is enough); picking an estimate shows its labour and parts and brings them into the proforma (a finalized estimate gives a finalized proforma). The New job card and walk-in link customer boxes also search as you type. Finalizing or moving back to draft (estimate) and finalizing (proforma) closes the window by itself, shows a short message and opens the Estimates or Proformas list (from a job card it returns to the card). A walk-in's estimate takes the card's customer and vehicle when loaded, and its proforma's insurance company, policy, claim, delivery date and priority move to the card. An estimate can be loaded only once (its proforma is then closed), and stock parts leave stock then.
- **Prices fill themselves.** Picking a stock part fills its price; typing hours fills the labour cost; typing a package labour description fills its hours and cost. All of them can be typed over.
- **Additional parts are issued by the Service Advisor.** A technician or supervisor *asks* for a part on a job card in the workshop; only the Service Advisor *issues* it (matches it to stock, sets the selling price) or rejects it. A job card cannot be closed while a request is waiting.

## Changes from the gap analysis (October 2026)
This list is what was added after comparing the project with the HillMaster screenshots, the Project Requirements Notes and the 14 workflow issues.

- **Manager role fixed in the database.** The users table only allowed SA, WS, TECH and ADMIN, so creating a Manager account failed. `MGR` is added (new databases get it from `schema.sql`; existing ones are altered on start).
- **A bug that broke the screens as soon as one part was in stock.** In `app.js` the sign-in secret was named `S`, hiding the stock module, so `/api/data` failed for every non-technician once the stock list had a part. Renamed.
- **Parts waiting for stock.** When an estimate, a proforma or a service package is loaded and a part is short, the load no longer fails: the part is added as *waiting for stock* and nothing leaves stock yet. Press *Receive* when it has arrived (add it with *Receive stock* first). The card cannot be closed or invoiced while a part is waiting. The Service Advisor can also add a short part as waiting from the part form.
- **Price approval.** A change beyond `PRICE_LIMIT_PCT` of the list price (labour or part) is a request: the line keeps its price and shows *waiting for the manager*; the Manager or Administrator sees *Approve / Reject* beside it. The manager's own changes are immediate. The card cannot be closed or invoiced while a request is open. Every decision is written in the card history.
- **Labour rate per section.** The manager sets the hourly rate of each section on the *Labour list* screen; an empty box uses `LABOUR_RATE`. Proformas, estimates and job cards fill the cost from hours x the section's rate.
- **Next service from any service work, counted from the mileage when the vehicle leaves.** A service typed in as ordinary labour (section *Regular Service*) now counts like a Type A/B/C package. When closing a card the advisor is asked for the mileage when the vehicle leaves (optional, never below the arrival reading); the next service is counted from it.
- **The customer is told "vehicle ready" once.** A closed card that is sent back and closed again no longer sends a second message (*Send again* is still on the card).
- **One estimation number.** A new proforma gets an `EST-...` number and keeps it when it becomes the estimate (older `PRO-...` proformas still get a new `EST-...` number on conversion).
- **The estimator list** shows advisors, supervisors, managers and administrators, not technicians.
- **Claim number, expected finish date and priority** on the job card and on the proforma; claim number on the invoice; terms and conditions text and the vehicle's mileage on the printed proforma.
- **End-of-day clock-out.** *End of working day: clock everybody out* on the Workshop screen (supervisor, manager) and, when `WORK_END` is set, automatically. A clock that started before the end time closes at the end time; one that started after it closes at midnight. Reason: *End of work day*.
- **Technicians can search the stock** when asking for a part: the search runs on the server and shows part number, description and whether it is in stock, never prices or quantities.
- **Lighter refresh.** The screens send the version of the stock list they have; the server sends the list again only when it changed. (The first load still sends the whole list: fine for a few thousand parts.)

Not done, on purpose (say if you want them): one technician on a task and one clock per person are still the rule; no technician assignment, overtime entry or working-hours setup; no supplied-by, fuel and lubricants, miscellaneous, sublet or other-charge lines on the proforma; no automatic reminder to the customer when the next service is near; labour is still not recalculated from clocked hours.

## Proformas, clocking and editing a job card
- **Insurance proforma (first-hand, before the job card).** *Proformas* screen -> *New proforma*: choose the customer and vehicle. It starts with the customer's insurance and the signed-in user as estimator. Set the **date**, the **estimator** (picked from the staff list with their role), the **insurance company** (from the registered list on the *Insurance* screen, or "None: the customer pays") and the policy number. Pick **labour tasks** (BP body & paints, ME mechanical, SV service) and **parts** from the lists: section, hours, cost and part price fill themselves and can be typed over. *Print proforma (A4)* works at any time (a draft prints marked DRAFT). *Issue proforma*, print it for the insurance, then *Create job card from this proforma*: the job card is created, the proforma becomes a **finalized estimate** loaded on it (stock parts leave stock then), and the proforma shows which job card it became. An issued proforma can still be edited until the job card is created.
- **Who the invoice is made out to.** A job card created from an insurance proforma carries the insurance company and policy number, and the invoice (A4 proforma and POS receipt) says *Bill to: the insurance company* with the vehicle owner named. A job card made directly for the customer is billed to the customer, as before. The Service Advisor can change it on the job card (*Invoice made out to: Change*: the customer, or any registered insurance company with a policy number) until the invoice is issued; each change is written in the card's history.
- **Customer insurance.** The customer profile has an insurance company (registered list) and a policy number.
- **Labour list.** The *Labour list* screen holds the tasks (BP / ME / SV) with hours and an optional fixed price (empty = hours x labour rate). On a job card, typing in *Labour task* offers the list; picking one fills section, hours and cost.
- **Clocking.** Body (BP) and mechanical (ME) tasks are clocked **one task at a time**. A Type A / B / C service is clocked **once for the whole package** (on its first line; completing it completes the package).
- **Back to the workshop.** From *Received by SA* or *Closed* (before the invoice) the Service Advisor presses *Return to workshop*, adds tasks (from the labour list) and parts, and the workshop receives, clocks the new tasks and sends it back. While the vehicle is in the workshop the advisor cannot add labour.
- **Editing a closed card.** Until the invoice is issued the advisor can still add labour (as a billing line, not clocked), issue or remove parts, change prices, and load another estimate. A task that was already clocked cannot be removed.
- **Nothing is lost.** Proformas and estimates save as drafts by themselves about a second after you stop typing, and every change is also copied to this device at once. After a power cut or a closed tab, reopening the proforma or estimate restores what was typed, and it is saved when the server is reachable (the screen says "Not saved yet ... will try again"). Half-filled forms (new customer, labour, part on a card, part request, insurer, labour task, new part, new job card, new vehicle, new estimate, new staff account) are kept the same way until they are submitted; the edit forms of an existing customer, vehicle or part are not. The **point-of-sale sale** being typed (customer, TIN, parts, quantities) and a **GRN** being typed are kept on this device the same way: after a power cut they come back as they were, with a note, until the sale is completed, the GRN is saved, or *Start over* is pressed. If the same proforma was saved from another PC after this PC's last edit, the newer server copy is opened instead of the older copy kept on this PC. Actions on a job card (add labour, issue a part, a status change) are saved by the server immediately.

Existing databases are upgraded on start: the new columns and tables are added automatically (`npm run migrate` does it by hand).

## Roles
| Role | Can do |
|---|---|
| Service Advisor | customers, vehicles, job cards, labour, parts and part requests, prices, services, estimates, dispatch, receive, close, invoices, delivery, stock, revenue and hours reports |
| Workshop Supervisor | receive and dispatch back job cards, clock in/out, supervisor stop, ask for parts, view stock, estimates and services, hours report |
| Technician | clock in/out on labour (own clocks only, one running clock at a time), ask for parts, own hours |
| Manager | everything the Service Advisor does, plus: create and edit items, cost and price, Excel import and export, change all prices, cancel sales, inventory-control and user-defined reports |
| Administrator | everything, plus staff accounts |

Every rule (role, status order, completed labour cannot be clocked in again, all labour completed before dispatch back) is enforced in `backend/rules.js` and `backend/app.js`, not only in the screens.

## Parts stock, purchases, point of sale
- **Part numbers** start with **S** (Suzuki), **T** (Toyota) or **B** (BYD); anything else is refused.
- **Cost and price.** Only the manager creates items and sees the cost. Typing the cost fills the price as **cost x 1.3**; the manager can type another price. Other users see the price only and cannot change it.
- **Excel.** *Parts stock → Import Excel* (manager) fills part number, description, quantity, cost, price, category and minimum from an .xlsx or .csv file (it checks the file first and shows what would change); *Export to Excel* downloads the list.
- **Quantity** leaves stock by itself when a part is sold at the counter or issued on a job card (also when an estimate or Type A/B/C package is loaded), and goes back when the line is removed or the sale cancelled.
- **Search by typing.** Job card *Add part*, requests, estimates, proformas, GRN and the point of sale all search the stock list by part number or any words of the description (no drop-down).
- **Purchases (GRN).** Search parts, enter the quantity bought and the cost; stock goes up and the part's cost is kept (the price follows cost x 1.3 unless the manager set it by hand). Printable A4.
- **Point of sale.** Cash sale, credit sale and proforma (with *show part numbers* on or off); only the manager can cancel a sale (parts return to stock). Cash and credit sales appear in **Invoices & payments** by themselves, together with job card invoices; credit invoices are paid there in one or more payments.
- **Customer TIN** is kept on the customer, can be typed at the till, and is printed on invoices and proformas.
- **Minimum stock reminder** pops up after sign-in for parts that are out of stock or at/below their minimum.
- **Lost sales** are written down when a sale or job-card issue is refused for lack of stock, and by *Record as lost sale* when the part is not in the list at all.
- **Change all prices** (manager): one percentage up or down, optionally only one make.
- **Reports** (*Stock & sales reports*): sales, lost sales, inventory control (manager) and a user-defined report (manager: pick the data, columns, filter, sort and grouping; CSV and Excel).

## Reports
**Reports** tab (Addis Ababa days, CSV download on each): **Revenue** (cash and credit invoices by the day issued; credit is shown separately; proformas are not counted) and **Technician hours** (clock-in to clock-out by technician, day and section; a technician sees only their own).

## "Vehicle ready" messages (SMS and/or Telegram)
When the Service Advisor closes a job card, the customer is told the vehicle is ready. Each customer is set to SMS + Telegram, SMS only, Telegram only, or do not notify. Every attempt (sent, failed, skipped and why) is listed on the job card with a **Send again** button (one per minute). A channel that is not set up never blocks closing.

- **SMS**: set `SMS_API_KEY` (and `SMS_IDENTIFIER` / `SMS_SENDER`). The code is written for AfroMessage; check `SMS_API_URL` and the field names in `sendSms()` in `backend/notify.js` against your provider, then close a test job card for a customer with your own number. `0980766566` becomes `+251980766566`.
- **Telegram**: create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN` and `PUBLIC_API_URL` (https address of the API). The webhook registers itself on start. In **Customers** press **Telegram link**, send it to the customer, and they tap **Start**. The link works once; `/stop` opts out.
- Wording: `READY_MESSAGE` with `{name} {plate} {jc} {phone}`.

## Checks
```
cd backend  && npm test                      # business rules, VAT, reports, price approval, waiting parts, end-of-day, search (no database needed)
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
- Labour is priced per line when it is added; it is not recalculated from clocked hours.

## Service Price Estimation sheet (proforma and estimate)
The insurance proforma and the Body & Paints estimate print on one A4 sheet modelled on the E-Ethio "Service Price Estimation": garage letterhead and estimation number, customer and insurance company (name, **address**, phone, policy and claim number) on the left, vehicle on the right, labour with price-book codes, other charges (parts and materials), *Total Est. Amount / VAT / Total Inc. VAT*, the amount in words, terms and Prepared / Checked / Approved signatures.
- **Insurance company address:** *Insurance* screen (or its Edit dialog); the Excel import also reads an optional "Address" column. Existing databases get the new column automatically when the API starts.
- **Walk-in customers** (not registered yet) print as "Walk-in customer (private)"; the vehicle details that are not recorded on a walk-in proforma (chassis, engine, colour, mileage) are left as blank lines to write by hand. A proforma without an insurance company prints "Customer pays".
- **Terms:** the default list is `DEFAULT_TERMS` in `frontend/src/lib/constants.js` (edit the wording and the 7-day validity there). Text typed in the proforma's *Terms and conditions* box is printed as the **REMARK**.
- Code: `frontend/src/print/EstimationSheet.jsx` (layout), `ProformaDoc.jsx` and `EstimateDoc.jsx` (data), styles in `styles/print.css`.

## Security, audit and operations

- **Security headers and limits:** every answer carries safe browser headers (no sniffing, no framing, no caching of API data, HSTS on HTTPS). One address may send `RATE_LIMIT_PER_MIN` requests a minute (default 1200: a whole garage shares one address); login attempts are limited per person.
- **Audit log (manager and administrator):** the *Audit log* screen shows who did what and when: sign-ins and failed sign-ins, finalized estimates and proformas, deleted records, staff changes, refused attempts. Only the action, record number and person are kept, never customer data or passwords, for about 13 months.
- **Logs:** one JSON line per request (`id`, method, path, status, milliseconds, user). The same id comes back to the browser as `X-Request-Id`, so a problem a user reports can be found in the Render logs. Set `REQUEST_LOG=false` to turn it off.
- **CI:** `.github/workflows/ci.yml` runs the backend tests (with a real MySQL) and the frontend tests and build on every push.
- **Backups:** switch on the automatic daily backup of your MySQL provider (and keep at least 7 days). A manual copy: `mysqldump --single-transaction -h HOST -u USER -p DBNAME > mg_auto_$(date +%F).sql`. Try a restore on an empty database once.
- **Uptime:** point a free monitor (UptimeRobot or similar) at `https://<your-service>.onrender.com/health`.
- **What a competitive product is expected to have:** see `docs/INTERNATIONAL_READINESS.md`.


## Security, language, approval and inspection (v2.1)
- **Backups:** `docs/BACKUP_RESTORE.md`, `backend/scripts/backup.sh`, `backend/scripts/restore-test.sh`. Switch on the provider's daily backup and try one restore.
- **Two-step sign-in:** the Manager and the Administrator turn it on in **Staff → Two-step sign-in** (authenticator app, 6-digit code; no extra package). After that, signing in asks for the code. If a phone is lost, the Manager/Administrator presses **Reset two-step** beside the person in Staff. A reminder shows on every screen until it is on.
- **Language and currency:** the **አማ / EN** button (sidebar, sign-in page and customer page) switches language. The Manager sets the currency code in **Staff → Currency** (default ETB). To translate more screens, wrap their texts in `t('English text')` and add the Amharic pair in `frontend/src/lib/i18n.js`.
- **Customer approval by link:** on a finalized estimate or an issued proforma, press **Make approval link**, send it (copy, Telegram, SMS). The customer opens it on his phone without signing in, sees a frozen copy of the document, types his name and approves or declines. The result (name, time, comment) shows on the document. A link works 14 days; making a new one withdraws the old one. If the frontend and API are on different hosts, set `VITE_API_URL` as before; the link uses the address of the frontend.
- **Reception inspection and photos:** on every job card: checklist (OK / Problem / N/A), fuel level, existing damage, valuables, keys, and up to 20 photos (taken with the phone camera, shrunk to about 1280 px in the browser, stored in the database). Service Advisor and Workshop Supervisor can add; only the Service Advisor can delete photos; locked once invoiced.
- **Database:** new tables `approvals`, `job_inspections`, `job_photos` and new `app_users` columns are created by `npm run migrate` (also at every start). Photos make the database grow: keep the backups large enough.

## Print look (A4 documents)
The A4 documents (estimate / proforma "Service Price Estimation", the A4 proforma invoice, delivery voucher, GRN, sale) share the MG Auto brand skin in `frontend/src/styles/print.css` (block "MG Auto brand skin"): logo letterhead with a blue-to-lime rule, tinted table headings, accent cards for customer / vehicle, tinted grand total, and a faint DRAFT watermark on draft estimates. Only light tints and thin rules are used, so it prints well on a black-and-white laser printer. The accent colours are the `--pb`, `--pd`, `--pg`, `--pt`, `--pl`, `--ps` variables on `.doc.a4`. The 80 mm cash/credit receipt stays plain black for thermal printers.

## Additional tasks after the workshop has finished
When the workshop sends the card back (Work done -> Received by SA), the Service Advisor can still add labour and parts, then press **Return to workshop**.
- A labour line added at that point is an **additional task**: it is *not* done. After the workshop receives the card again, a technician must **clock in and out** on it and complete it, like any other task. The card shows an "additional task: to do" badge, a banner lists them, and the workshop queue shows "n additional".
- The workshop cannot press *Work done* until every additional task is completed, and the Service Advisor cannot **close** the card or issue a **cash / credit invoice** while a task is not done (a proforma quote can still be printed).
- For a charge that needs no work (a fee, a delivery), tick **Billing only** when adding it: that line is created as completed and is never clocked.
- Parts added by the advisor need no clock: they leave stock when issued, as before.

## Assigning tasks to technicians (workshop supervisor)
- While a card is with the workshop (*Dispatched* or *Received by workshop*), the **workshop supervisor** (and the Manager / Administrator) opens the job card and uses **Assign** on a task to tick one or several technicians. The box above the labour list gives all unassigned tasks to one technician in one step. A Type A/B/C package is one task and is assigned on its first line.
- Only the chosen technicians can **clock in** on an assigned task; other technicians see "Assigned to ..." instead of the button. The supervisor can still clock any task. A task nobody is assigned to stays open to every technician, so nothing is blocked if the supervisor has not assigned it yet.
- A technician cannot be taken off a task while he is clocked in on it. Completed tasks keep their record ("done by ...").
- **Workshop** screen: technicians get **My tasks** (what is assigned to them); the supervisor gets **Tasks by technician** (open tasks per technician, who is working, and tasks nobody has yet). Every assignment is written in the job card history.
- Technicians are the users with the *Technician* role. The server sends the list to staff in `/api/data` (`techs`); assignment is `POST /api/jobs/:id/assign` with `{ lids, tech_ids }`.
