# Visibility and layout update

## What is new
- Dashboard tiles open the filtered list; sidebar badges (Workshop, Job cards, Parts, Service due); workshop List/Board view with overdue and urgent colours.
- Manager dashboard: cash collected today, unpaid credit invoices by age, who is clocked in, 7/30-day sales lines.
- Stock insight (manager): what to buy (from lost sales), top sellers, parts with no movement.
- Service due: vehicles at or near their next service, with a Telegram/SMS reminder (uses the existing notifier; Telegram first, SMS as the fallback, the customer's choice respected).
- Role-based home: technician task cards with clock in, advisor counter shortcuts, manager money first.
- Phone bottom bar, tables as cards, sticky headers, Ctrl K search, barcode scan button, S/T/B make chips, status icons.
- Display settings (spacing, accent colour, high contrast), larger touch targets for technicians, maskable PWA icons.

## Deploying
1. `npm install` in backend and frontend as usual. No new packages.
2. The server creates the new table (`service_reminders`) by itself on start (`db.migrate()`), nothing to run by hand.
3. Optional: `SERVICE_DUE_MESSAGE` in the backend environment to change the reminder text ({name} {plate} {service} {km} {phone}). Telegram and SMS use the settings you already have.
4. New backend routes: GET /api/insight/manager, GET /api/insight/stock (manager); GET /api/service-due/reminders, POST /api/service-due/remind (sales advisor and above).
5. The service worker cache name is now `mg-auto-v5`, so phones pick up the new screens on the next open.

## Changed existing files
backend: app.js (passes the notifier), pos.js (mounts insight.js), notify.js (sendText), config.js, sql/schema.sql, .env.example, test/rules.test.js (table count 22 → 23).
frontend: App.jsx, Pages.jsx, Stock.jsx, ui.jsx, Icon.jsx, PartSearch.jsx, store.jsx, main.jsx, index.html, public/manifest.webmanifest, public/sw.js.
