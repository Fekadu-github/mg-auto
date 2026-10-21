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
| Backups | Automatic daily database backup with a tested restore | Next: switch on the provider's backups (see README, "Backups") |
| Two-step sign-in (2FA) | One-time code for manager and administrator | Next |
| Languages | Amharic / English switch, right-to-left ready | Next |
| Currency and tax | Currency and tax rules in settings instead of code | Partly (VAT and rates in settings, currency text fixed) |
| Accessibility | Keyboard use, screen-reader labels, contrast (WCAG 2.1 AA) | Partly |
| Integrations | Documented API (OpenAPI), accounting export, payment links | Next |
| Customer portal | Customer sees progress and approves the estimate online | Next |
| Digital inspection | Photos and checklist at reception | Next |
| Analytics | Technician efficiency, workshop utilisation, margin per job | Partly (hours and sales reports) |
| Reliability | Error tracking, uptime alert on `/health`, load test | Next |
| Privacy | Data export and deletion on request, retention rules | Partly (audit retention done) |

## Suggested order for the next steps
1. Database backups switched on and one restore tried.
2. Two-step sign-in for manager and administrator.
3. Language switch (Amharic) and currency setting.
4. Customer approval of estimates by link.
5. Photos and inspection checklist.
