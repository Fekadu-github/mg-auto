# MG Auto: what an internationally competitive workshop product is expected to have

Status: **Done** = in the project now · **Partly** = exists, can go further · **Next** = not built yet (planned order below).

## Basic expectations (a customer or auditor assumes these)

| Area | Expectation | Status |
|---|---|---|
| Workflow | Customer, vehicle, estimate, proforma, job card, workshop clocks, invoice, delivery | Done |
| Accuracy | Totals, VAT and stock computed on the server; stock can never go negative | Done |
| Accounts | Individual logins, roles (advisor, workshop, technician, manager, administrator), password hashing, session expiry | Done |
| Staff control | Administrator creates, changes and deletes staff; old sessions end when an account changes | Done |
| Data safety | Every change in one transaction; two people editing at once take turns | Done |
| Security headers | No sniffing, no framing, no caching of API data, HSTS on HTTPS | Done |
| Abuse protection | Login attempt limit per person; request limit per address | Done |
| Audit trail | Who did what and when (kept about 13 months), visible to the manager | Done |
| Traceability | Request id on every answer and in the log (JSON line per request) | Done |
| Automated tests | Rules, search, formats, security and a full API test against real MySQL | Done |
| CI | Every push runs the tests and the build (GitHub Actions) | Done |
| Offline / install | Installable web app (PWA) | Done |
| Documents | Printable estimate, proforma, job card, invoice, delivery voucher | Done |
| Notifications | SMS / Telegram when the vehicle is ready | Done |

## Higher-level expectations (what the best products add)

| Area | Expectation | Status |
|---|---|---|
| Backups | Automatic daily database backup with a tested restore | Runbook, backup script and restore-test script added (`docs/BACKUP_RESTORE.md`). **You still have to switch it on at the provider and run one restore.** |
| Two-step sign-in (2FA) | One-time code for manager and administrator | Done (authenticator app; each person turns it on in Staff; lost phone: reset by the Manager/Administrator) |
| Languages | Amharic / English switch, right-to-left ready | Done for the menu, sign-in and all new screens; other texts stay English until wrapped in `t()` (`frontend/src/lib/i18n.js`) |
| Currency and tax | Currency and tax rules in settings instead of code | Done (VAT, rates and the currency code are settings; the currency shows on screens, prints and exports) |
| Accessibility | Keyboard use, screen-reader labels, contrast (WCAG 2.1 AA) | Partly |
| Integrations | Documented API (OpenAPI), accounting export, payment links | Next |
| Customer portal | Customer approves the estimate or proforma online | Done (approval link; progress tracking not yet) |
| Digital inspection | Photos and checklist at reception | Done (job card: checklist, fuel, valuables, up to 20 photos) |
| Analytics | Technician efficiency, workshop utilisation, margin per job | Partly (hours and sales reports) |
| Reliability | Error tracking, uptime alert on `/health`, load test | Next |
| Privacy | Data export and deletion on request, retention rules | Partly (audit retention done) |

## Suggested order for the next steps
1. Database backups switched on and one restore tried.
2. Two-step sign-in for manager and administrator.
3. Language switch (Amharic) and currency setting.
4. Customer approval of estimates by link.
5. Photos and inspection checklist.
